const express = require('express');
const { v4: uuidv4 } = require('uuid');
const hubspot = require('../services/hubspot');
const queueManager = require('../services/queue-manager');
const { PROTOCOL_TEMPLATES, VALID_STEP_TYPES } = require('../config/treatment-protocols');

const router = express.Router();

// In-memory treatment protocol storage
const protocols = {};

// GET /api/treatments/templates - List available protocol templates
router.get('/templates', (req, res) => {
  res.json({ templates: PROTOCOL_TEMPLATES });
});

// POST /api/treatments/create - Define a treatment protocol
router.post('/create', (req, res) => {
  const { name, actorId, steps, rateLimits, listId, templateId } = req.body;

  if (!name || !actorId) {
    return res.status(400).json({ error: 'name and actorId are required' });
  }

  // Optionally clone from template
  let protocolSteps = steps;
  if (templateId && PROTOCOL_TEMPLATES[templateId]) {
    protocolSteps = steps || PROTOCOL_TEMPLATES[templateId].steps;
  }

  if (!protocolSteps || protocolSteps.length === 0) {
    return res.status(400).json({ error: 'steps are required (or provide a templateId)' });
  }

  // Validate step types
  for (const step of protocolSteps) {
    if (!VALID_STEP_TYPES.includes(step.type)) {
      return res.status(400).json({ error: `Invalid step type: ${step.type}`, validTypes: VALID_STEP_TYPES });
    }
  }

  const id = uuidv4();
  protocols[id] = {
    id,
    name,
    actorId,
    steps: protocolSteps,
    rateLimits: rateLimits || {},
    listId: listId || null,
    status: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  res.status(201).json(protocols[id]);
});

// GET /api/treatments - List all protocols
router.get('/', (req, res) => {
  res.json({ protocols: Object.values(protocols) });
});

// GET /api/treatments/:id - Get a protocol
router.get('/:id', (req, res) => {
  const protocol = protocols[req.params.id];
  if (!protocol) return res.status(404).json({ error: 'Protocol not found' });
  res.json(protocol);
});

// PUT /api/treatments/:id - Update a protocol
router.put('/:id', (req, res) => {
  const protocol = protocols[req.params.id];
  if (!protocol) return res.status(404).json({ error: 'Protocol not found' });

  const { name, actorId, steps, rateLimits, listId } = req.body;
  if (name) protocol.name = name;
  if (actorId) protocol.actorId = actorId;
  if (steps) protocol.steps = steps;
  if (rateLimits) protocol.rateLimits = rateLimits;
  if (listId !== undefined) protocol.listId = listId;
  protocol.updatedAt = new Date().toISOString();

  res.json(protocol);
});

// POST /api/treatments/initiate - Start processing a list through a protocol
router.post('/initiate', async (req, res) => {
  const { protocolId, listId, contactIds } = req.body;

  if (!protocolId) {
    return res.status(400).json({ error: 'protocolId is required' });
  }

  const protocol = protocols[protocolId];
  if (!protocol) {
    return res.status(404).json({ error: 'Protocol not found' });
  }

  try {
    let ids = contactIds || [];

    // If listId provided, fetch members from HubSpot
    if (listId && ids.length === 0 && hubspot.isConfigured()) {
      const listData = await hubspot.getListMembers(listId);
      ids = (listData.results || []).map(r => r.recordId || r.id);
    }

    if (ids.length === 0) {
      return res.status(400).json({ error: 'No contacts to process. Provide contactIds or a listId.' });
    }

    // Create treatment run in queue
    const { runId, itemCount } = queueManager.createTreatmentRun(
      protocolId,
      protocol,
      ids,
      protocol.actorId
    );

    protocol.status = 'active';
    protocol.updatedAt = new Date().toISOString();

    res.json({ success: true, runId, itemCount, protocolId });
  } catch (error) {
    console.error('Treatment initiate error:', error.message);
    res.status(500).json({ error: 'Failed to initiate treatment', details: error.message });
  }
});

// GET /api/treatments/:id/status - Get treatment run progress
router.get('/:id/status', (req, res) => {
  const status = queueManager.getTreatmentStatus(req.params.id);
  if (!status) return res.status(404).json({ error: 'Treatment run not found' });
  res.json(status);
});

// POST /api/treatments/:id/pause - Pause processing
router.post('/:id/pause', (req, res) => {
  const treatment = queueManager.setTreatmentStatus(req.params.id, 'paused');
  if (!treatment) return res.status(404).json({ error: 'Treatment run not found' });
  res.json({ success: true, treatment });
});

// POST /api/treatments/:id/resume - Resume processing
router.post('/:id/resume', (req, res) => {
  const treatment = queueManager.setTreatmentStatus(req.params.id, 'in_progress');
  if (!treatment) return res.status(404).json({ error: 'Treatment run not found' });
  res.json({ success: true, treatment });
});

// Expose protocol lookup for other modules
router.getProtocol = (id) => protocols[id];

module.exports = router;
