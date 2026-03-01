const express = require('express');
const hubspot = require('../services/hubspot');
const unipile = require('../services/unipile');
const sumble = require('../services/sumble');

const router = express.Router();

// GET /api/onboarding/status - Check setup status of all integrations
router.get('/status', (req, res) => {
  const status = {
    hubspot: { configured: hubspot.isConfigured() },
    unipile: { configured: unipile.isConfigured() },
    sumble: { configured: sumble.isConfigured() },
    properties: { setup: false }, // Will be checked via HubSpot API
  };

  const allConfigured = status.hubspot.configured && status.unipile.configured && status.sumble.configured;

  res.json({
    status,
    ready: allConfigured,
    nextStep: !status.hubspot.configured
      ? 'Configure HubSpot access token'
      : !status.unipile.configured
        ? 'Configure Unipile API key and DSN'
        : !status.sumble.configured
          ? 'Configure Sumble API key'
          : 'Setup HubSpot properties via POST /api/enrich/setup',
  });
});

// POST /api/onboarding/setup-all - Run complete setup
router.post('/setup-all', async (req, res) => {
  const results = {
    properties: null,
    checks: {},
  };

  // 1. Setup HubSpot properties
  if (hubspot.isConfigured()) {
    try {
      results.properties = await hubspot.setupProperties();
    } catch (err) {
      results.properties = { error: err.message };
    }
  } else {
    results.properties = { error: 'HubSpot not configured' };
  }

  // 2. Verify Unipile connectivity
  if (unipile.isConfigured()) {
    results.checks.unipile = { configured: true };
  } else {
    results.checks.unipile = { configured: false, error: 'Missing UNIPILE_API_KEY or UNIPILE_DSN' };
  }

  // 3. Verify Sumble connectivity
  if (sumble.isConfigured()) {
    results.checks.sumble = { configured: true };
  } else {
    results.checks.sumble = { configured: false, error: 'Missing SUMBLE_API_KEY' };
  }

  res.json({ success: true, results });
});

module.exports = router;
