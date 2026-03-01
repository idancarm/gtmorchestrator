const express = require('express');
const queueManager = require('../services/queue-manager');
const rateLimiter = require('../services/rate-limiter');
const contactTracker = require('../services/contact-tracker');
const hubspot = require('../services/hubspot');
const { getActorsStore } = require('../services/store');
const { MESSAGING_STEP_TYPES } = require('../config/treatment-protocols');
const { executeStep } = require('../services/step-executor');

const router = express.Router();

// GET /api/queue - Get all active treatment runs
router.get('/', async (req, res) => {
  try {
    const treatments = await queueManager.getActiveTreatments();
    res.json({ treatments });
  } catch (error) {
    console.error('Queue list error:', error.message);
    res.status(500).json({ error: 'Failed to list queue', details: error.message });
  }
});

// GET /api/queue/all - Get all treatment runs (including completed)
router.get('/all', async (req, res) => {
  try {
    const treatments = await queueManager.getAllTreatments();
    res.json({ treatments });
  } catch (error) {
    console.error('Queue list all error:', error.message);
    res.status(500).json({ error: 'Failed to list all queue', details: error.message });
  }
});

// GET /api/queue/rate-limits/all - Get rate limit usage for all actors
router.get('/rate-limits/all', (req, res) => {
  res.json({ usage: rateLimiter.getAllUsage() });
});

// GET /api/queue/rate-limits/:actorId - Get rate limit usage for an actor
router.get('/rate-limits/:actorId', (req, res) => {
  res.json({ usage: rateLimiter.getUsage(req.params.actorId) });
});

// GET /api/queue/:runId - Get a specific run's status
router.get('/:runId', async (req, res) => {
  try {
    const status = await queueManager.getTreatmentStatus(req.params.runId);
    if (!status) return res.status(404).json({ error: 'Run not found' });
    res.json(status);
  } catch (error) {
    console.error('Queue status error:', error.message);
    res.status(500).json({ error: 'Failed to get queue status', details: error.message });
  }
});

// POST /api/queue/process - Manually trigger queue processing (same logic as scheduled function)
router.post('/process', async (req, res) => {
  try {
    const activeTreatments = await queueManager.getActiveTreatments();
    let processedCount = 0;
    const log = [];

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
            log.push({ contact: item.contactId, action: 'completed (no more steps)' });
            continue;
          }

          const isMessagingStep = MESSAGING_STEP_TYPES.includes(step.type);
          if (isMessagingStep) {
            const activityCheck = await contactTracker.canActOnContact(item.contactId, step.type, cadenceMs);
            if (!activityCheck.allowed) {
              log.push({ contact: item.contactId, action: 'skipped', reason: activityCheck.reason });
              continue;
            }
          }

          await queueManager.updateItemStatus(treatment.id, item.id, 'in_progress');

          let actor = null;
          let actorId = treatment.actorId;
          let unipileAccountId = treatment.actorId;

          try {
            const contact = await hubspot.getContact(item.contactId, ['hubspot_owner_id']);
            const ownerId = contact.properties?.hubspot_owner_id;
            if (ownerId) {
              const ownerEmail = await hubspot.getOwnerEmail(ownerId);
              if (ownerEmail) {
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
            // fallback below
          }

          if (!actor) {
            const actorsStore = getActorsStore();
            actor = await actorsStore.get(treatment.actorId, { type: 'json' });
            if (actor) unipileAccountId = actor.unipileAccountId;
          }

          if (!item.context) item.context = {};
          const result = await executeStep(step, item.contactId, actorId, unipileAccountId, item.context);

          if (result.providerId) item.context.providerId = result.providerId;
          if (result.copy) item.context.generatedCopy = result.copy;
          if (result.data) item.context.enrichmentData = result.data;

          if (result.status === 'rate_limited') {
            await queueManager.updateItemStatus(treatment.id, item.id, 'pending');
            log.push({ contact: item.contactId, step: step.type, result: 'rate_limited' });
          } else if (result.status === 'failed') {
            await queueManager.updateItemStatus(treatment.id, item.id, 'failed', { error: result.reason });
            log.push({ contact: item.contactId, step: step.type, result: 'failed', reason: result.reason });
          } else {
            const nextStepIndex = item.currentStep + 1;
            const nextStep = treatment.protocol.steps[nextStepIndex];
            const nextIsMessaging = nextStep && MESSAGING_STEP_TYPES.includes(nextStep.type);
            const nextDelayMs = nextIsMessaging ? cadenceMs : undefined;

            await queueManager.updateItemStatus(treatment.id, item.id, 'completed', {
              stepIncrement: true,
              stepType: step.type,
              nextDelayMs,
            });

            if (isMessagingStep) {
              await contactTracker.recordContactAction(item.contactId, step.type, { actorId, runId: treatment.id });
            }

            log.push({ contact: item.contactId, step: step.type, result: result.status, context: item.context });
          }

          processedCount++;
        } catch (error) {
          await queueManager.updateItemStatus(treatment.id, item.id, 'failed', { error: error.message });
          log.push({ contact: item.contactId, error: error.message });
        }
      }
    }

    res.json({ processed: processedCount, log });
  } catch (error) {
    console.error('Manual process error:', error.message);
    res.status(500).json({ error: 'Processing failed', details: error.message });
  }
});

module.exports = router;
