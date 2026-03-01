const express = require('express');
const queueManager = require('../services/queue-manager');
const rateLimiter = require('../services/rate-limiter');

const router = express.Router();

// GET /api/queue - Get all active treatment runs
router.get('/', (req, res) => {
  const treatments = queueManager.getActiveTreatments();
  res.json({ treatments });
});

// GET /api/queue/all - Get all treatment runs (including completed)
router.get('/all', (req, res) => {
  const treatments = queueManager.getAllTreatments();
  res.json({ treatments });
});

// GET /api/queue/:runId - Get a specific run's status
router.get('/:runId', (req, res) => {
  const status = queueManager.getTreatmentStatus(req.params.runId);
  if (!status) return res.status(404).json({ error: 'Run not found' });
  res.json(status);
});

// GET /api/queue/rate-limits - Get rate limit usage for all actors
router.get('/rate-limits/all', (req, res) => {
  res.json({ usage: rateLimiter.getAllUsage() });
});

// GET /api/queue/rate-limits/:actorId - Get rate limit usage for an actor
router.get('/rate-limits/:actorId', (req, res) => {
  res.json({ usage: rateLimiter.getUsage(req.params.actorId) });
});

module.exports = router;
