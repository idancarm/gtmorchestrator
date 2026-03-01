const { v4: uuidv4 } = require('uuid');
const { MIN_DELAY_BETWEEN_ACTIONS_MS } = require('../config/rate-limits');

// In-memory queue storage
// In production, use Netlify Blobs or a database
const treatments = {};  // treatmentId -> treatment metadata
const queueItems = {};  // treatmentId -> [{ id, contactId, step, status, ... }]

const STATUSES = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
  PAUSED: 'paused',
  SKIPPED: 'skipped',
};

// Create a treatment run and queue all items
function createTreatmentRun(treatmentId, protocol, contactIds, actorId) {
  const runId = uuidv4();

  treatments[runId] = {
    id: runId,
    treatmentId,
    protocol,
    actorId,
    status: STATUSES.IN_PROGRESS,
    totalContacts: contactIds.length,
    createdAt: new Date().toISOString(),
  };

  queueItems[runId] = contactIds.map((contactId, index) => ({
    id: uuidv4(),
    runId,
    contactId,
    currentStep: 0,
    totalSteps: protocol.steps.length,
    status: STATUSES.PENDING,
    // Stagger items to respect rate limits
    scheduledAfter: new Date(Date.now() + index * MIN_DELAY_BETWEEN_ACTIONS_MS).toISOString(),
    attempts: 0,
    maxAttempts: 3,
    lastError: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));

  return { runId, itemCount: contactIds.length };
}

// Get next eligible items for processing
function getNextItems(runId, limit = 5) {
  const items = queueItems[runId];
  if (!items) return [];

  const treatment = treatments[runId];
  if (!treatment || treatment.status === STATUSES.PAUSED) return [];

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
function updateItemStatus(runId, itemId, status, { stepIncrement = false, error = null } = {}) {
  const items = queueItems[runId];
  if (!items) return null;

  const item = items.find(i => i.id === itemId);
  if (!item) return null;

  item.status = status;
  item.updatedAt = new Date().toISOString();
  item.attempts++;

  if (error) item.lastError = error;

  if (stepIncrement) {
    item.currentStep++;
    // If more steps remain, reset to pending
    if (item.currentStep < item.totalSteps) {
      item.status = STATUSES.PENDING;
      item.scheduledAfter = new Date(Date.now() + MIN_DELAY_BETWEEN_ACTIONS_MS).toISOString();
    }
  }

  return item;
}

// Pause/resume a treatment run
function setTreatmentStatus(runId, status) {
  if (!treatments[runId]) return null;
  treatments[runId].status = status;
  return treatments[runId];
}

// Get treatment run status with progress
function getTreatmentStatus(runId) {
  const treatment = treatments[runId];
  if (!treatment) return null;

  const items = queueItems[runId] || [];
  const counts = {
    pending: 0,
    in_progress: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
  };

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
function getActiveTreatments() {
  return Object.values(treatments)
    .filter(t => t.status === STATUSES.IN_PROGRESS || t.status === STATUSES.PAUSED)
    .map(t => getTreatmentStatus(t.id));
}

// Get all treatment runs
function getAllTreatments() {
  return Object.values(treatments).map(t => getTreatmentStatus(t.id));
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
