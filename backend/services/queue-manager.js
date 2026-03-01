const { v4: uuidv4 } = require('uuid');
const { MIN_DELAY_BETWEEN_ACTIONS_MS } = require('../config/rate-limits');
const { getTreatmentRunsStore, getQueueItemsStore } = require('./store');

const STATUSES = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
  PAUSED: 'paused',
  SKIPPED: 'skipped',
};

// Create a treatment run and queue all items
async function createTreatmentRun(treatmentId, protocol, contactIds, actorId) {
  const runsStore = getTreatmentRunsStore();
  const itemsStore = getQueueItemsStore();
  const runId = uuidv4();

  const run = {
    id: runId,
    treatmentId,
    protocol,
    actorId,
    status: STATUSES.IN_PROGRESS,
    totalContacts: contactIds.length,
    createdAt: new Date().toISOString(),
  };

  await runsStore.setJSON(runId, run);

  // Store items as a single blob keyed by runId
  const items = contactIds.map((contactId, index) => ({
    id: uuidv4(),
    runId,
    contactId,
    currentStep: 0,
    totalSteps: protocol.steps.length,
    status: STATUSES.PENDING,
    scheduledAfter: new Date(Date.now() + index * MIN_DELAY_BETWEEN_ACTIONS_MS).toISOString(),
    attempts: 0,
    maxAttempts: 3,
    lastError: null,
    context: {},
    stepEnteredAt: new Date().toISOString(),
    stepHistory: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));

  await itemsStore.setJSON(runId, items);

  return { runId, itemCount: contactIds.length };
}

// Get next eligible items for processing
async function getNextItems(runId, limit = 5) {
  const runsStore = getTreatmentRunsStore();
  const itemsStore = getQueueItemsStore();

  const treatment = await runsStore.get(runId, { type: 'json' });
  if (!treatment || treatment.status === STATUSES.PAUSED) return [];

  const items = await itemsStore.get(runId, { type: 'json' });
  if (!items) return [];

  const now = new Date().toISOString();

  return items
    .filter(item =>
      item.status === STATUSES.PENDING &&
      item.scheduledAfter <= now &&
      item.attempts < item.maxAttempts
    )
    .slice(0, limit);
}

// Update an item's status after processing
async function updateItemStatus(runId, itemId, status, { stepIncrement = false, error = null, stepType = null, nextDelayMs = null } = {}) {
  const itemsStore = getQueueItemsStore();

  const items = await itemsStore.get(runId, { type: 'json' });
  if (!items) return null;

  const item = items.find(i => i.id === itemId);
  if (!item) return null;

  item.status = status;
  item.updatedAt = new Date().toISOString();
  item.attempts++;

  if (error) item.lastError = error;

  if (stepIncrement) {
    // Record completed step in history
    if (!item.stepHistory) item.stepHistory = [];
    item.stepHistory.push({
      step: item.currentStep,
      type: stepType,
      enteredAt: item.stepEnteredAt,
      completedAt: new Date().toISOString(),
    });

    item.currentStep++;
    item.stepEnteredAt = new Date().toISOString();

    if (item.currentStep < item.totalSteps) {
      item.status = STATUSES.PENDING;
      const delay = nextDelayMs != null ? nextDelayMs : MIN_DELAY_BETWEEN_ACTIONS_MS;
      item.scheduledAfter = new Date(Date.now() + delay).toISOString();
    }
  }

  await itemsStore.setJSON(runId, items);
  return item;
}

// Pause/resume a treatment run
async function setTreatmentStatus(runId, status) {
  const runsStore = getTreatmentRunsStore();
  const treatment = await runsStore.get(runId, { type: 'json' });
  if (!treatment) return null;

  treatment.status = status;
  await runsStore.setJSON(runId, treatment);
  return treatment;
}

// Get treatment run status with progress
async function getTreatmentStatus(runId) {
  const runsStore = getTreatmentRunsStore();
  const itemsStore = getQueueItemsStore();

  const treatment = await runsStore.get(runId, { type: 'json' });
  if (!treatment) return null;

  const items = await itemsStore.get(runId, { type: 'json' }) || [];
  const counts = { pending: 0, in_progress: 0, completed: 0, failed: 0, skipped: 0 };

  for (const item of items) {
    if (counts[item.status] !== undefined) counts[item.status]++;
  }

  return {
    ...treatment,
    progress: counts,
    totalItems: items.length,
    percentComplete: items.length > 0
      ? Math.round((counts.completed / items.length) * 100)
      : 0,
  };
}

// Get all active treatment runs
async function getActiveTreatments() {
  const runsStore = getTreatmentRunsStore();
  const { blobs } = await runsStore.list();
  const active = [];

  for (const entry of blobs) {
    const status = await getTreatmentStatus(entry.key);
    if (status && (status.status === STATUSES.IN_PROGRESS || status.status === STATUSES.PAUSED)) {
      active.push(status);
    }
  }

  return active;
}

// Get all treatment runs
async function getAllTreatments() {
  const runsStore = getTreatmentRunsStore();
  const { blobs } = await runsStore.list();
  const all = [];

  for (const entry of blobs) {
    const status = await getTreatmentStatus(entry.key);
    if (status) all.push(status);
  }

  return all;
}

module.exports = {
  createTreatmentRun,
  getNextItems,
  updateItemStatus,
  setTreatmentStatus,
  getTreatmentStatus,
  getActiveTreatments,
  getAllTreatments,
  STATUSES,
};
