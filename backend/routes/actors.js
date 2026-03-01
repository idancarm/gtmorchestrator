const express = require('express');
const { v4: uuidv4 } = require('uuid');
const rateLimiter = require('../services/rate-limiter');

const router = express.Router();

// In-memory actor storage (in production: HubSpot app settings)
const actors = {};

// GET /api/actors - List all actors
router.get('/', (req, res) => {
  const actorList = Object.values(actors).map(actor => ({
    ...actor,
    usage: rateLimiter.getUsage(actor.id),
  }));
  res.json({ actors: actorList });
});

// GET /api/actors/:id - Get a single actor
router.get('/:id', (req, res) => {
  const actor = actors[req.params.id];
  if (!actor) return res.status(404).json({ error: 'Actor not found' });

  res.json({
    ...actor,
    usage: rateLimiter.getUsage(actor.id),
  });
});

// POST /api/actors - Add new actor
router.post('/', (req, res) => {
  const { name, email, unipileAccountId, hubspotUserId, salesHubTier, rateLimitOverrides } = req.body;

  if (!name || !email || !unipileAccountId) {
    return res.status(400).json({ error: 'name, email, and unipileAccountId are required' });
  }

  const id = uuidv4();
  actors[id] = {
    id,
    name,
    email,
    unipileAccountId,
    hubspotUserId: hubspotUserId || null,
    salesHubTier: salesHubTier || 'professional',
    rateLimitOverrides: rateLimitOverrides || {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  res.status(201).json(actors[id]);
});

// PUT /api/actors/:id - Update actor
router.put('/:id', (req, res) => {
  const actor = actors[req.params.id];
  if (!actor) return res.status(404).json({ error: 'Actor not found' });

  const { name, email, unipileAccountId, hubspotUserId, salesHubTier, rateLimitOverrides } = req.body;

  if (name) actor.name = name;
  if (email) actor.email = email;
  if (unipileAccountId) actor.unipileAccountId = unipileAccountId;
  if (hubspotUserId !== undefined) actor.hubspotUserId = hubspotUserId;
  if (salesHubTier) actor.salesHubTier = salesHubTier;
  if (rateLimitOverrides) actor.rateLimitOverrides = rateLimitOverrides;
  actor.updatedAt = new Date().toISOString();

  res.json(actor);
});

// DELETE /api/actors/:id - Remove actor
router.delete('/:id', (req, res) => {
  if (!actors[req.params.id]) return res.status(404).json({ error: 'Actor not found' });
  delete actors[req.params.id];
  res.json({ success: true });
});

// Expose actor lookup for other modules
router.getActor = (id) => actors[id];
router.getActorByUnipileAccount = (accountId) =>
  Object.values(actors).find(a => a.unipileAccountId === accountId);

module.exports = router;
