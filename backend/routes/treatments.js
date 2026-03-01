const express = require('express');
const { v4: uuidv4 } = require('uuid');
const hubspot = require('../services/hubspot');
const queueManager = require('../services/queue-manager');
const { PROTOCOL_TEMPLATES, VALID_STEP_TYPES } = require('../config/treatment-protocols');
const { getProtocolsStore } = require('../services/store');

const router = express.Router();

// GET /api/treatments/templates - List available protocol templates
router.get('/templates', (req, res) => {
  res.json({ templates: PROTOCOL_TEMPLATES });
});

// GET /api/treatments/lists - List HubSpot lists/segments
router.get('/lists', async (req, res) => {
  try {
    if (!hubspot.isConfigured()) {
      return res.status(400).json({ error: 'HubSpot not configured' });
    }
    const lists = await hubspot.getLists();
    res.json({ lists });
  } catch (error) {
    console.error('Get lists error:', error.message);
    res.status(500).json({ error: 'Failed to fetch lists', details: error.message });
  }
});

// POST /api/treatments/create - Define a treatment protocol
router.post('/create', async (req, res) => {
  const { name, actorId, steps, rateLimits, listId, templateId, cadenceDays } = req.body;

  if (!name || !actorId) {
    return res.status(400).json({ error: 'name and actorId are required' });
  }

  let protocolSteps = steps;
  if (templateId && PROTOCOL_TEMPLATES[templateId]) {
    protocolSteps = steps || PROTOCOL_TEMPLATES[templateId].steps;
  }

  if (!protocolSteps || protocolSteps.length === 0) {
    return res.status(400).json({ error: 'steps are required (or provide a templateId)' });
  }

  for (const step of protocolSteps) {
    if (!VALID_STEP_TYPES.includes(step.type)) {
      return res.status(400).json({ error: `Invalid step type: ${step.type}`, validTypes: VALID_STEP_TYPES });
    }
  }

  try {
    const store = getProtocolsStore();
    const id = uuidv4();
    const protocol = {
      id,
      name,
      actorId,
      steps: protocolSteps,
      cadenceDays: cadenceDays != null ? Number(cadenceDays) : 1,
      rateLimits: rateLimits || {},
      listId: listId || null,
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await store.setJSON(id, protocol);
    res.status(201).json(protocol);
  } catch (error) {
    console.error('Create protocol error:', error.message);
    res.status(500).json({ error: 'Failed to create protocol', details: error.message });
  }
});

// GET /api/treatments - List all protocols
router.get('/', async (req, res) => {
  try {
    const store = getProtocolsStore();
    const { blobs } = await store.list();
    const protocols = [];

    for (const entry of blobs) {
      const protocol = await store.get(entry.key, { type: 'json' });
      if (protocol) protocols.push(protocol);
    }

    res.json({ protocols });
  } catch (error) {
    console.error('List protocols error:', error.message);
    res.status(500).json({ error: 'Failed to list protocols', details: error.message });
  }
});

// GET /api/treatments/:id - Get a protocol
router.get('/:id', async (req, res) => {
  try {
    const store = getProtocolsStore();
    const protocol = await store.get(req.params.id, { type: 'json' });
    if (!protocol) return res.status(404).json({ error: 'Protocol not found' });
    res.json(protocol);
  } catch (error) {
    console.error('Get protocol error:', error.message);
    res.status(500).json({ error: 'Failed to get protocol', details: error.message });
  }
});

// PUT /api/treatments/:id - Update a protocol
router.put('/:id', async (req, res) => {
  try {
    const store = getProtocolsStore();
    const protocol = await store.get(req.params.id, { type: 'json' });
    if (!protocol) return res.status(404).json({ error: 'Protocol not found' });

    const { name, actorId, steps, rateLimits, listId, cadenceDays } = req.body;
    if (name) protocol.name = name;
    if (actorId) protocol.actorId = actorId;
    if (steps) protocol.steps = steps;
    if (rateLimits) protocol.rateLimits = rateLimits;
    if (listId !== undefined) protocol.listId = listId;
    if (cadenceDays != null) protocol.cadenceDays = Number(cadenceDays);
    protocol.updatedAt = new Date().toISOString();

    await store.setJSON(protocol.id, protocol);
    res.json(protocol);
  } catch (error) {
    console.error('Update protocol error:', error.message);
    res.status(500).json({ error: 'Failed to update protocol', details: error.message });
  }
});

// DELETE /api/treatments/:id - Delete a protocol
router.delete('/:id', async (req, res) => {
  try {
    const store = getProtocolsStore();
    const protocol = await store.get(req.params.id, { type: 'json' });
    if (!protocol) return res.status(404).json({ error: 'Protocol not found' });

    await store.delete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete protocol error:', error.message);
    res.status(500).json({ error: 'Failed to delete protocol', details: error.message });
  }
});

// POST /api/treatments/initiate - Start processing a list through a protocol
router.post('/initiate', async (req, res) => {
  const { protocolId, listId, contactIds } = req.body;

  if (!protocolId) {
    return res.status(400).json({ error: 'protocolId is required' });
  }

  try {
    const store = getProtocolsStore();
    const protocol = await store.get(protocolId, { type: 'json' });
    if (!protocol) {
      return res.status(404).json({ error: 'Protocol not found' });
    }

    let ids = contactIds || [];

    if (listId && ids.length === 0 && hubspot.isConfigured()) {
      const listData = await hubspot.getListMembers(listId);
      ids = (listData.results || []).map(r => r.recordId || r.id);
    }

    if (ids.length === 0) {
      return res.status(400).json({ error: 'No contacts to process. Provide contactIds or a listId.' });
    }

    const { runId, itemCount } = await queueManager.createTreatmentRun(
      protocolId,
      protocol,
      ids,
      protocol.actorId
    );

    protocol.status = 'active';
    protocol.updatedAt = new Date().toISOString();
    await store.setJSON(protocolId, protocol);

    res.json({ success: true, runId, itemCount, protocolId });
  } catch (error) {
    console.error('Treatment initiate error:', error.message);
    res.status(500).json({ error: 'Failed to initiate treatment', details: error.message });
  }
});

// GET /api/treatments/:id/status - Get treatment run progress
router.get('/:id/status', async (req, res) => {
  const status = await queueManager.getTreatmentStatus(req.params.id);
  if (!status) return res.status(404).json({ error: 'Treatment run not found' });
  res.json(status);
});

// POST /api/treatments/:id/pause - Pause processing
router.post('/:id/pause', async (req, res) => {
  const treatment = await queueManager.setTreatmentStatus(req.params.id, 'paused');
  if (!treatment) return res.status(404).json({ error: 'Treatment run not found' });
  res.json({ success: true, treatment });
});

// POST /api/treatments/:id/resume - Resume processing
router.post('/:id/resume', async (req, res) => {
  const treatment = await queueManager.setTreatmentStatus(req.params.id, 'in_progress');
  if (!treatment) return res.status(404).json({ error: 'Treatment run not found' });
  res.json({ success: true, treatment });
});

module.exports = router;
