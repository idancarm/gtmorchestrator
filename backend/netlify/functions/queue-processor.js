const { connectLambda } = require('@netlify/blobs');
const queueManager = require('../../services/queue-manager');
const rateLimiter = require('../../services/rate-limiter');
const unipile = require('../../services/unipile');
const sumble = require('../../services/sumble');
const hubspot = require('../../services/hubspot');
const copyGenerator = require('../../services/copy-generator');
const { getActorsStore } = require('../../services/store');

// Execute a single treatment step on a contact
async function executeStep(step, contactId, actorId, unipileAccountId) {
  switch (step.type) {
    case 'enrich': {
      if (!hubspot.isConfigured()) throw new Error('HubSpot not configured');

      const contact = await hubspot.getContact(contactId, ['company', 'hs_linkedin_url']);
      const company = contact.properties?.company;

      if (!company && !contact.properties?.hs_linkedin_url) {
        return { status: 'skipped', reason: 'No company or LinkedIn URL' };
      }

      const result = await sumble.enrichOrganization(company, null, step.params?.techGroups);

      await hubspot.updateContact(contactId, {
        orch_enrichment_status: 'completed',
        orch_last_processed: new Date().toISOString(),
      });

      return { status: 'completed', data: result };
    }

    case 'linkedin_search': {
      const contact = await hubspot.getContact(contactId, ['firstname', 'lastname', 'company', 'hs_linkedin_url']);
      const props = contact.properties || {};

      if (step.params?.useProfileUrl && props.hs_linkedin_url) {
        return { status: 'completed', providerId: props.hs_linkedin_url };
      }

      if (!props.firstname && !props.lastname) {
        return { status: 'skipped', reason: 'No name available for search' };
      }

      const check = rateLimiter.canPerformAction(actorId, 'searches');
      if (!check.allowed) {
        return { status: 'rate_limited', reason: check.reason, retryAfterMs: check.retryAfterMs };
      }

      const items = await unipile.search(unipileAccountId, {
        firstname: props.firstname,
        lastname: props.lastname,
        company: props.company,
      });
      rateLimiter.recordAction(actorId, 'searches');

      if (items.length === 0) {
        return { status: 'completed', found: false };
      }

      return { status: 'completed', found: true, providerId: items[0].id };
    }

    case 'check_connection': {
      const contact = await hubspot.getContact(contactId, ['hs_linkedin_url']);
      const providerId = contact.properties?.hs_linkedin_url;
      if (!providerId) return { status: 'skipped', reason: 'No LinkedIn profile ID' };

      const check = rateLimiter.canPerformAction(actorId, 'profile_views');
      if (!check.allowed) {
        return { status: 'rate_limited', reason: check.reason };
      }

      const profile = await unipile.getProfile(unipileAccountId, providerId);
      rateLimiter.recordAction(actorId, 'profile_views');

      const isFirstDegree =
        profile.network_distance === 'FIRST_DEGREE' ||
        profile.network_distance === 'DISTANCE_1' ||
        profile.is_relationship === true;

      await hubspot.updateContact(contactId, {
        orch_linkedin_status: isFirstDegree ? 'connected' : profile.network_distance,
      });

      return { status: 'completed', isFirstDegree, networkDistance: profile.network_distance };
    }

    case 'send_connection_request': {
      const contact = await hubspot.getContact(contactId, ['hs_linkedin_url', 'orch_linkedin_status']);
      const providerId = contact.properties?.hs_linkedin_url;

      if (!providerId) return { status: 'skipped', reason: 'No LinkedIn profile ID' };
      if (contact.properties?.orch_linkedin_status === 'connected') {
        return { status: 'skipped', reason: 'Already connected' };
      }

      const check = rateLimiter.canPerformAction(actorId, 'connection_requests');
      if (!check.allowed) {
        return { status: 'rate_limited', reason: check.reason };
      }

      const message = step.params?.messageTemplate || '';
      await unipile.sendInvite(unipileAccountId, providerId, message);
      rateLimiter.recordAction(actorId, 'connection_requests');

      await hubspot.updateContact(contactId, {
        orch_linkedin_status: 'invite_sent',
        orch_last_processed: new Date().toISOString(),
      });

      return { status: 'completed' };
    }

    case 'send_message': {
      const contact = await hubspot.getContact(contactId, ['hs_linkedin_url', 'orch_linkedin_status']);
      const providerId = contact.properties?.hs_linkedin_url;

      if (!providerId) return { status: 'skipped', reason: 'No LinkedIn profile ID' };
      if (contact.properties?.orch_linkedin_status !== 'connected') {
        return { status: 'skipped', reason: 'Not connected (1st degree required for messaging)' };
      }

      const check = rateLimiter.canPerformAction(actorId, 'messages');
      if (!check.allowed) {
        return { status: 'rate_limited', reason: check.reason };
      }

      const message = step.params?.messageTemplate || '';
      await unipile.sendMessage(unipileAccountId, providerId, message);
      rateLimiter.recordAction(actorId, 'messages');

      return { status: 'completed' };
    }

    case 'enroll_sequence': {
      if (!step.params?.sequenceId) return { status: 'skipped', reason: 'No sequenceId configured' };

      const contact = await hubspot.getContact(contactId, ['email']);
      if (!contact.properties?.email) return { status: 'skipped', reason: 'No email' };

      const result = await hubspot.enrollInSequence(
        step.params.sequenceId,
        contact.properties.email,
        step.params.senderEmail || ''
      );

      return result.success
        ? { status: 'completed' }
        : { status: 'failed', reason: result.error };
    }

    case 'generate_copy': {
      if (!copyGenerator.isConfigured()) return { status: 'skipped', reason: 'AI not configured' };

      const contact = await hubspot.getContact(contactId, ['firstname', 'lastname', 'company', 'jobtitle']);
      const result = await copyGenerator.generate({
        type: step.params?.copyType || 'connection_request',
        contactContext: contact.properties,
        actorContext: step.params?.actorContext,
        messagingBlocks: step.params?.messagingBlocks,
        brandVoice: step.params?.brandVoice,
      });

      return { status: 'completed', copy: result.copy };
    }

    default:
      return { status: 'skipped', reason: `Unknown step type: ${step.type}` };
  }
}

// Scheduled function handler - runs every 5 minutes
exports.handler = async (event) => {
  connectLambda(event);

  console.log('Queue processor running at', new Date().toISOString());

  const activeTreatments = await queueManager.getActiveTreatments();
  let processedCount = 0;

  for (const treatment of activeTreatments) {
    if (treatment.status === 'paused') continue;

    const items = await queueManager.getNextItems(treatment.id, 5);

    for (const item of items) {
      try {
        await queueManager.updateItemStatus(treatment.id, item.id, 'in_progress');

        const step = treatment.protocol.steps[item.currentStep];
        if (!step) {
          await queueManager.updateItemStatus(treatment.id, item.id, 'completed');
          continue;
        }

        // Get actor's Unipile account ID from blob store
        const actorsStore = getActorsStore();
        const actor = await actorsStore.get(treatment.actorId, { type: 'json' });
        const unipileAccountId = actor?.unipileAccountId || treatment.actorId;

        const result = await executeStep(step, item.contactId, treatment.actorId, unipileAccountId);

        if (result.status === 'rate_limited') {
          await queueManager.updateItemStatus(treatment.id, item.id, 'pending');
        } else if (result.status === 'failed') {
          await queueManager.updateItemStatus(treatment.id, item.id, 'failed', { error: result.reason });
        } else {
          await queueManager.updateItemStatus(treatment.id, item.id, 'completed', { stepIncrement: true });
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
