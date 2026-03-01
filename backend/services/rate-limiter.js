const { DAILY_LIMITS, HOURLY_LIMITS, MIN_DELAY_BETWEEN_ACTIONS_MS } = require('../config/rate-limits');

// In-memory rate limit tracking per actor
// Structure: { [actorId]: { [actionType]: { daily: count, hourly: count, lastAction: timestamp, dailyReset: timestamp, hourlyReset: timestamp } } }
const actorLimits = {};

function getActorState(actorId, actionType) {
  if (!actorLimits[actorId]) actorLimits[actorId] = {};
  if (!actorLimits[actorId][actionType]) {
    actorLimits[actorId][actionType] = {
      daily: 0,
      hourly: 0,
      lastAction: 0,
      dailyReset: startOfDay(),
      hourlyReset: startOfHour(),
    };
  }

  const state = actorLimits[actorId][actionType];

  // Reset daily counter if past midnight
  const todayStart = startOfDay();
  if (state.dailyReset < todayStart) {
    state.daily = 0;
    state.dailyReset = todayStart;
  }

  // Reset hourly counter if past the hour
  const hourStart = startOfHour();
  if (state.hourlyReset < hourStart) {
    state.hourly = 0;
    state.hourlyReset = hourStart;
  }

  return state;
}

function startOfDay() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfHour() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  return d.getTime();
}

// Check if an action can be performed for a given actor
function canPerformAction(actorId, actionType, overrides = {}) {
  const state = getActorState(actorId, actionType);
  const dailyLimit = overrides.dailyLimit || DAILY_LIMITS[actionType] || Infinity;
  const hourlyLimit = overrides.hourlyLimit || HOURLY_LIMITS[actionType] || Infinity;

  if (state.daily >= dailyLimit) {
    return { allowed: false, reason: `Daily limit reached (${state.daily}/${dailyLimit})` };
  }

  if (state.hourly >= hourlyLimit) {
    return { allowed: false, reason: `Hourly limit reached (${state.hourly}/${hourlyLimit})` };
  }

  const timeSinceLast = Date.now() - state.lastAction;
  if (timeSinceLast < MIN_DELAY_BETWEEN_ACTIONS_MS) {
    const waitMs = MIN_DELAY_BETWEEN_ACTIONS_MS - timeSinceLast;
    return { allowed: false, reason: `Too soon, wait ${Math.ceil(waitMs / 1000)}s`, retryAfterMs: waitMs };
  }

  return { allowed: true };
}

// Record that an action was performed
function recordAction(actorId, actionType) {
  const state = getActorState(actorId, actionType);
  state.daily++;
  state.hourly++;
  state.lastAction = Date.now();
}

// Get current usage stats for an actor
function getUsage(actorId) {
  if (!actorLimits[actorId]) return {};

  const usage = {};
  for (const [actionType, state] of Object.entries(actorLimits[actorId])) {
    // Force reset check
    getActorState(actorId, actionType);
    usage[actionType] = {
      daily: { used: state.daily, limit: DAILY_LIMITS[actionType] || 'unlimited' },
      hourly: { used: state.hourly, limit: HOURLY_LIMITS[actionType] || 'unlimited' },
      lastAction: state.lastAction ? new Date(state.lastAction).toISOString() : null,
    };
  }
  return usage;
}

// Get usage for all actors
function getAllUsage() {
  const all = {};
  for (const actorId of Object.keys(actorLimits)) {
    all[actorId] = getUsage(actorId);
  }
  return all;
}

module.exports = { canPerformAction, recordAction, getUsage, getAllUsage };
