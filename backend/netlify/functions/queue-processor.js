const { connectLambda } = require('@netlify/blobs');
const queueManager = require('../../services/queue-manager');
const contactTracker = require('../../services/contact-tracker');
const hubspot = require('../../services/hubspot');
const { getActorsStore } = require('../../services/store');
const { MESSAGING_STEP_TYPES } = require('../../config/treatment-protocols');
const { executeStep } = require('../../services/step-executor');

// Scheduled function handler - runs every 5 minutes
exports.handler = async (event) => {
  connectLambda(event);

  console.log('Queue processor running at', new Date().toISOString());

  const activeTreatments = await queueManager.getActiveTreatments();
  let processedCount = 0;

  for (const treatment of activeTreatments) {
    if (treatment.status === 'paused') continue;

    const items = await queueManager.getNextItems(treatment.id, 5);

    const cadenceDays = treatment.protocol?.cadenceDays || 1;
    const cadenceMs = cadenceDays * 86400000;

    for (const item of items) {
      try {
        const step = treatment.protocol.steps[item.currentStep];
        if (!step) {
          await queueManager.updateItemStatus(treatment.id, item.id, 'completed');
          continue;
        }

        // Check global contact activity for messaging steps
        const isMessagingStep = MESSAGING_STEP_TYPES.includes(step.type);
        if (isMessagingStep) {
          const activityCheck = await contactTracker.canActOnContact(item.contactId, step.type, cadenceMs);
          if (!activityCheck.allowed) {
            console.log(`Contact ${item.contactId} skipped: ${activityCheck.reason}`);
            continue; // Leave as pending, pick up next cycle
          }
        }

        await queueManager.updateItemStatus(treatment.id, item.id, 'in_progress');

        // Resolve actor: contact owner → owner email → actor
        let actor = null;
        let actorId = treatment.actorId;
        let unipileAccountId = treatment.actorId;

        // Try to resolve from contact's HubSpot owner
        try {
          const contact = await hubspot.getContact(item.contactId, ['hubspot_owner_id']);
          const ownerId = contact.properties?.hubspot_owner_id;

          if (ownerId) {
            const ownerEmail = await hubspot.getOwnerEmail(ownerId);
            if (ownerEmail) {
              // Find actor by owner email
              const actorsStore = getActorsStore();
              const { blobs } = await actorsStore.list();
              for (const entry of blobs) {
                const a = await actorsStore.get(entry.key, { type: 'json' });
                if (a && a.email.toLowerCase() === ownerEmail.toLowerCase()) {
                  actor = a;
                  actorId = a.id;
                  unipileAccountId = a.unipileAccountId;
                  break;
                }
              }
            }
          }
        } catch (ownerErr) {
          console.warn(`Owner resolution failed for contact ${item.contactId}:`, ownerErr.message);
        }

        // Fallback: use treatment-level actorId
        if (!actor) {
          const actorsStore = getActorsStore();
          actor = await actorsStore.get(treatment.actorId, { type: 'json' });
          if (actor) {
            unipileAccountId = actor.unipileAccountId;
          }
        }

        if (!item.context) item.context = {};
        const result = await executeStep(step, item.contactId, actorId, unipileAccountId, item.context);

        // Merge result data into item context
        if (result.providerId) item.context.providerId = result.providerId;
        if (result.copy) item.context.generatedCopy = result.copy;
        if (result.data) item.context.enrichmentData = result.data;

        if (result.status === 'rate_limited') {
          await queueManager.updateItemStatus(treatment.id, item.id, 'pending');
        } else if (result.status === 'failed') {
          await queueManager.updateItemStatus(treatment.id, item.id, 'failed', { error: result.reason });
        } else {
          // Calculate delay for next step based on whether it's a messaging step
          const nextStepIndex = item.currentStep + 1;
          const nextStep = treatment.protocol.steps[nextStepIndex];
          const nextIsMessaging = nextStep && MESSAGING_STEP_TYPES.includes(nextStep.type);
          const nextDelayMs = nextIsMessaging ? cadenceMs : undefined;

          await queueManager.updateItemStatus(treatment.id, item.id, 'completed', {
            stepIncrement: true,
            stepType: step.type,
            nextDelayMs,
          });

          // Record global contact activity for messaging steps
          if (isMessagingStep) {
            await contactTracker.recordContactAction(item.contactId, step.type, {
              actorId,
              runId: treatment.id,
            });
          }
        }

        processedCount++;
      } catch (error) {
        console.error(`Queue item ${item.id} failed:`, error.message);
        await queueManager.updateItemStatus(treatment.id, item.id, 'failed', { error: error.message });
      }
    }
  }

  console.log(`Queue processor completed: ${processedCount} items processed`);

  return {
    statusCode: 200,
    body: JSON.stringify({ processed: processedCount }),
  };
};
