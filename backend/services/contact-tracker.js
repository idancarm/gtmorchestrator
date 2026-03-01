const { getContactActivityStore } = require('./store');

// Record that an action was performed on a contact
async function recordContactAction(contactId, actionType, { actorId, runId }) {
  const store = getContactActivityStore();
  const record = await store.get(contactId, { type: 'json' }) || { contactId, actions: {} };

  record.actions[actionType] = {
    at: new Date().toISOString(),
    actorId,
    runId,
  };

  await store.setJSON(contactId, record);
}

// Check if enough time has passed since the last action of this type on this contact
async function canActOnContact(contactId, actionType, minIntervalMs) {
  const store = getContactActivityStore();
  const record = await store.get(contactId, { type: 'json' });

  if (!record || !record.actions[actionType]) {
    return { allowed: true };
  }

  const lastActionAt = new Date(record.actions[actionType].at).getTime();
  const elapsed = Date.now() - lastActionAt;

  if (elapsed < minIntervalMs) {
    return {
      allowed: false,
      reason: `Contact was already actioned (${actionType}) ${Math.round(elapsed / 3600000)}h ago, need ${Math.round(minIntervalMs / 3600000)}h`,
      lastActionAt: record.actions[actionType].at,
    };
  }

  return { allowed: true };
}

// Get the full activity record for a contact
async function getContactState(contactId) {
  const store = getContactActivityStore();
  return await store.get(contactId, { type: 'json' }) || null;
}

module.exports = { recordContactAction, canActOnContact, getContactState };
