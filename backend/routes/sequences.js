const express = require('express');
const hubspot = require('../services/hubspot');

const router = express.Router();

// POST /api/sequences/enroll - Enroll a contact in a HubSpot sequence
router.post('/enroll', async (req, res) => {
  const { sequenceId, contactEmail, senderEmail, contactId } = req.body;

  if (!sequenceId || !contactEmail || !senderEmail) {
    return res.status(400).json({ error: 'sequenceId, contactEmail, and senderEmail are required' });
  }

  if (!hubspot.isConfigured()) {
    return res.status(500).json({ error: 'HubSpot not configured' });
  }

  try {
    const result = await hubspot.enrollInSequence(sequenceId, contactEmail, senderEmail);

    if (!result.success) {
      // Check if it's a tier issue (Professional vs Enterprise)
      if (result.category === 'VALIDATION_ERROR' || result.error?.includes('sequence')) {
        return res.status(403).json({
          error: 'Sequence enrollment failed',
          details: result.error,
          hint: 'Sequence enrollment API requires Sales Hub Enterprise. For Professional tier, consider manual enrollment guidance.',
        });
      }
      return res.status(400).json({ error: result.error });
    }

    // Update contact status in HubSpot
    if (contactId) {
      await hubspot.updateContact(contactId, {
        orch_treatment_status: 'sequence_enrolled',
        orch_last_processed: new Date().toISOString(),
      });
    }

    res.json({ success: true, data: result.data });
  } catch (error) {
    console.error('Sequence enrollment error:', error.message);
    res.status(500).json({ error: 'Failed to enroll in sequence', details: error.message });
  }
});

module.exports = router;
