const express = require('express');
const copyGenerator = require('../services/copy-generator');

const router = express.Router();

// POST /api/copy/generate - Generate message copy
router.post('/generate', async (req, res) => {
  const { type, contactContext, actorContext, messagingBlocks, brandVoice, customInstructions } = req.body;

  if (!type) {
    return res.status(400).json({
      error: 'type is required',
      validTypes: ['connection_request', 'linkedin_message', 'sales_email', 'marketing_email'],
    });
  }

  if (!copyGenerator.isConfigured()) {
    return res.status(500).json({ error: 'AI API key not configured' });
  }

  try {
    const result = await copyGenerator.generate({
      type,
      contactContext,
      actorContext,
      messagingBlocks,
      brandVoice,
      customInstructions,
    });

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Copy generation error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to generate copy',
      details: error.response?.data || error.message,
    });
  }
});

// POST /api/copy/resolve - Resolve token placeholders in text
router.post('/resolve', (req, res) => {
  const { text, properties } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'text is required' });
  }

  const resolved = copyGenerator.resolveTokens(text, properties || {});
  res.json({ success: true, resolved });
});

module.exports = router;
