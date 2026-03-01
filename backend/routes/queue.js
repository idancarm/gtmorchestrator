const express = require('express');
const queueManager = require('../services/queue-manager');
const rateLimiter = require('../services/rate-limiter');

const router = express.Router();

// GET /api/queue - Get all active treatment runs
router.get('/', async (req, res) => {
  try {
    const treatments = await queueManager.getActiveTreatments();
    res.json({ treatments });
  } catch (error) {
    console.error('Queue list error:', error.message);
    res.status(500).json({ error: 'Failed to list queue', details: error.message });
  }
});

// GET /api/queue/all - Get all treatment runs (including completed)
router.get('/all', async (req, res) => {
  try {
    const treatments = await queueManager.getAllTreatments();
    res.json({ treatments });
  } catch (error) {
    console.error('Queue list all error:', error.message);
    res.status(500).json({ error: 'Failed to list all queue', details: error.message });
  }
});

// GET /api/queue/rate-limits/all - Get rate limit usage for all actors
router.get('/rate-limits/all', (req, res) => {
  res.json({ usage: rateLimiter.getAllUsage() });
});

// GET /api/queue/rate-limits/:actorId - Get rate limit usage for an actor
router.get('/rate-limits/:actorId', (req, res) => {
  res.json({ usage: rateLimiter.getUsage(req.params.actorId) });
});

// GET /api/queue/:runId - Get a specific run's status
router.get('/:runId', async (req, res) => {
  try {
    const status = await queueManager.getTreatmentStatus(req.params.runId);
    if (!status) return res.status(404).json({ error: 'Run not found' });
    res.json(status);
  } catch (error) {
    console.error('Queue status error:', error.message);
    res.status(500).json({ error: 'Failed to get queue status', details: error.message });
  }
});

module.exports = router;
