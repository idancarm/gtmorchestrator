const express = require('express');
const unipile = require('../services/unipile');
const rateLimiter = require('../services/rate-limiter');
const { getActorsStore } = require('../services/store');

const router = express.Router();

// Middleware: validate Unipile is configured
function requireUnipile(req, res, next) {
  if (!unipile.isConfigured()) {
    return res.status(500).json({ error: 'Unipile not configured' });
  }
  next();
}

// Middleware: extract and validate actorId + get Unipile account ID
async function requireActor(req, res, next) {
  const { actorId } = req.body;
  if (!actorId) {
    return res.status(400).json({ error: 'actorId is required' });
  }

  try {
    const store = getActorsStore();
    const actor = await store.get(actorId, { type: 'json' });

    if (actor) {
      req.unipileAccountId = actor.unipileAccountId;
      req.actor = actor;
    } else {
      // Fallback: treat actorId as Unipile account ID directly
      req.unipileAccountId = actorId;
    }
  } catch {
    req.unipileAccountId = actorId;
  }

  next();
}

router.use(requireUnipile);

// POST /api/linkedin/search - Search for LinkedIn profile
router.post('/search', requireActor, async (req, res) => {
  const { firstname, lastname, company } = req.body;

  if (!firstname && !lastname) {
    return res.status(400).json({ error: 'firstname or lastname is required' });
  }

  // Check rate limit for searches
  const check = rateLimiter.canPerformAction(req.body.actorId, 'searches');
  if (!check.allowed) {
    return res.status(429).json({ error: 'Rate limit exceeded', details: check.reason, retryAfterMs: check.retryAfterMs });
  }

  try {
    const items = await unipile.search(req.unipileAccountId, { firstname, lastname, company });
    rateLimiter.recordAction(req.body.actorId, 'searches');
    res.json({ success: true, items });
  } catch (error) {
    console.error('LinkedIn search error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to search LinkedIn',
      details: error.response?.data || error.message,
    });
  }
});

// POST /api/linkedin/profile - Get profile + connection status
router.post('/profile', requireActor, async (req, res) => {
  const { providerId } = req.body;

  if (!providerId) {
    return res.status(400).json({ error: 'providerId is required' });
  }

  const check = rateLimiter.canPerformAction(req.body.actorId, 'profile_views');
  if (!check.allowed) {
    return res.status(429).json({ error: 'Rate limit exceeded', details: check.reason, retryAfterMs: check.retryAfterMs });
  }

  try {
    const profile = await unipile.getProfile(req.unipileAccountId, providerId);
    rateLimiter.recordAction(req.body.actorId, 'profile_views');

    const isFirstDegree =
      profile.network_distance === 'FIRST_DEGREE' ||
      profile.network_distance === 'DISTANCE_1' ||
      profile.is_relationship === true;

    res.json({ success: true, profile, isFirstDegree });
  } catch (error) {
    console.error('LinkedIn profile error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to get LinkedIn profile',
      details: error.response?.data || error.message,
    });
  }
});

// POST /api/linkedin/connect - Send connection request
router.post('/connect', requireActor, async (req, res) => {
  const { providerId, message } = req.body;

  if (!providerId) {
    return res.status(400).json({ error: 'providerId is required' });
  }

  const check = rateLimiter.canPerformAction(req.body.actorId, 'connection_requests');
  if (!check.allowed) {
    return res.status(429).json({ error: 'Rate limit exceeded', details: check.reason, retryAfterMs: check.retryAfterMs });
  }

  try {
    const data = await unipile.sendInvite(req.unipileAccountId, providerId, message);
    rateLimiter.recordAction(req.body.actorId, 'connection_requests');
    res.json({ success: true, data });
  } catch (error) {
    console.error('LinkedIn connect error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to send connection request',
      details: error.response?.data || error.message,
    });
  }
});

// POST /api/linkedin/message - Send message (1st degree only)
router.post('/message', requireActor, async (req, res) => {
  const { providerId, message } = req.body;

  if (!providerId || !message?.trim()) {
    return res.status(400).json({ error: 'providerId and message are required' });
  }

  const check = rateLimiter.canPerformAction(req.body.actorId, 'messages');
  if (!check.allowed) {
    return res.status(429).json({ error: 'Rate limit exceeded', details: check.reason, retryAfterMs: check.retryAfterMs });
  }

  try {
    const data = await unipile.sendMessage(req.unipileAccountId, providerId, message);
    rateLimiter.recordAction(req.body.actorId, 'messages');
    res.json({ success: true, data });
  } catch (error) {
    console.error('LinkedIn message error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to send LinkedIn message',
      details: error.response?.data || error.message,
    });
  }
});

// POST /api/linkedin/invite-status - Check pending invites
router.post('/invite-status', requireActor, async (req, res) => {
  const { providerId } = req.body;

  if (!providerId) {
    return res.status(400).json({ error: 'providerId is required' });
  }

  try {
    const pending = await unipile.getInviteStatus(req.unipileAccountId, providerId);
    res.json({ success: true, pending });
  } catch (error) {
    console.error('LinkedIn invite-status error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to check invite status',
      details: error.response?.data || error.message,
    });
  }
});

module.exports = router;
