const express = require('express');
const sumble = require('../services/sumble');
const cargo = require('../services/cargo');
const hubspot = require('../services/hubspot');

const router = express.Router();

// POST /api/enrich - Enrich a contact/company
router.post('/', async (req, res) => {
  const { domain, linkedin_url, company_id, contact_id, techGroups } = req.body;

  if (!domain && !linkedin_url) {
    return res.status(400).json({ error: 'domain or linkedin_url required' });
  }

  try {
    let enrichResult = null;

    // Waterfall: try Sumble first, fall back to Cargo
    if (sumble.isConfigured()) {
      enrichResult = await sumble.enrichOrganization(domain, linkedin_url, techGroups);
      enrichResult.provider = 'sumble';
    } else if (cargo.isConfigured()) {
      enrichResult = await cargo.enrichCompany(domain);
      enrichResult.provider = 'cargo';
    } else {
      return res.status(500).json({ error: 'No enrichment provider configured' });
    }

    // Write results back to HubSpot if company_id provided
    if (company_id && hubspot.isConfigured() && enrichResult.technologiesByCategory) {
      const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
      const properties = {};

      for (const [key, techs] of Object.entries(enrichResult.technologiesByCategory)) {
        const orchKey = key.startsWith('orch_') ? key : `orch_${key}`;
        properties[orchKey] = Array.isArray(techs) ? techs.join(', ') : techs;
      }

      if (enrichResult.linkedinUrl) {
        properties.orch_sumble_linkedin_url = enrichResult.linkedinUrl;
      }
      properties.orch_last_enriched = now;

      await hubspot.updateCompany(company_id, properties);
    }

    // Update contact enrichment status if contact_id provided
    if (contact_id && hubspot.isConfigured()) {
      await hubspot.updateContact(contact_id, {
        orch_enrichment_status: 'completed',
        orch_last_processed: new Date().toISOString(),
      });
    }

    res.json({ success: true, ...enrichResult });
  } catch (error) {
    console.error('Enrich error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to enrich',
      details: error.response?.data || error.message,
    });
  }
});

// POST /api/enrich/setup - Create HubSpot property group + properties
router.post('/setup', async (req, res) => {
  if (!hubspot.isConfigured()) {
    return res.status(500).json({ error: 'HubSpot not configured' });
  }

  try {
    const results = await hubspot.setupProperties();
    res.json({ success: true, results });
  } catch (error) {
    console.error('Setup error:', error.message);
    res.status(500).json({ error: 'Failed to setup properties', details: error.message });
  }
});

module.exports = router;
