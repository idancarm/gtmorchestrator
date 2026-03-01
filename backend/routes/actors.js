const express = require('express');
const { v4: uuidv4 } = require('uuid');
const rateLimiter = require('../services/rate-limiter');
const { getActorsStore } = require('../services/store');

const router = express.Router();

// GET /api/actors - List all actors
router.get('/', async (req, res) => {
  try {
    const store = getActorsStore();
    const { blobs } = await store.list();
    const actors = [];

    for (const entry of blobs) {
      const actor = await store.get(entry.key, { type: 'json' });
      if (actor) {
        actor.usage = rateLimiter.getUsage(actor.id);
        actors.push(actor);
      }
    }

    res.json({ actors });
  } catch (error) {
    console.error('List actors error:', error.message);
    res.status(500).json({ error: 'Failed to list actors', details: error.message });
  }
});

// GET /api/actors/:id - Get a single actor
router.get('/:id', async (req, res) => {
  try {
    const store = getActorsStore();
    const actor = await store.get(req.params.id, { type: 'json' });
    if (!actor) return res.status(404).json({ error: 'Actor not found' });

    actor.usage = rateLimiter.getUsage(actor.id);
    res.json(actor);
  } catch (error) {
    console.error('Get actor error:', error.message);
    res.status(500).json({ error: 'Failed to get actor', details: error.message });
  }
});

// POST /api/actors - Add new actor
router.post('/', async (req, res) => {
  const { name, email, unipileAccountId, hubspotUserId, salesHubTier, rateLimitOverrides } = req.body;

  if (!name || !email || !unipileAccountId) {
    return res.status(400).json({ error: 'name, email, and unipileAccountId are required' });
  }

  try {
    const store = getActorsStore();
    const id = uuidv4();
    const actor = {
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

    await store.setJSON(id, actor);
    res.status(201).json(actor);
  } catch (error) {
    console.error('Create actor error:', error.message);
    res.status(500).json({ error: 'Failed to create actor', details: error.message });
  }
});

// PUT /api/actors/:id - Update actor
router.put('/:id', async (req, res) => {
  try {
    const store = getActorsStore();
    const actor = await store.get(req.params.id, { type: 'json' });
    if (!actor) return res.status(404).json({ error: 'Actor not found' });

    const { name, email, unipileAccountId, hubspotUserId, salesHubTier, rateLimitOverrides } = req.body;

    if (name) actor.name = name;
    if (email) actor.email = email;
    if (unipileAccountId) actor.unipileAccountId = unipileAccountId;
    if (hubspotUserId !== undefined) actor.hubspotUserId = hubspotUserId;
    if (salesHubTier) actor.salesHubTier = salesHubTier;
    if (rateLimitOverrides) actor.rateLimitOverrides = rateLimitOverrides;
    actor.updatedAt = new Date().toISOString();

    await store.setJSON(actor.id, actor);
    res.json(actor);
  } catch (error) {
    console.error('Update actor error:', error.message);
    res.status(500).json({ error: 'Failed to update actor', details: error.message });
  }
});

// DELETE /api/actors/:id - Remove actor
router.delete('/:id', async (req, res) => {
  try {
    const store = getActorsStore();
    const actor = await store.get(req.params.id, { type: 'json' });
    if (!actor) return res.status(404).json({ error: 'Actor not found' });

    await store.delete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete actor error:', error.message);
    res.status(500).json({ error: 'Failed to delete actor', details: error.message });
  }
});

module.exports = router;
