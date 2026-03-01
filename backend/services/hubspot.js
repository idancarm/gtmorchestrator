const axios = require('axios');

const HS_API_BASE = 'https://api.hubapi.com';

class HubSpotClient {
  constructor() {
    this.token = process.env.HUBSPOT_ACCESS_TOKEN;
    this._ownerCache = {}; // ownerId -> { data, cachedAt }
    this._ownerCacheTTL = 10 * 60 * 1000; // 10 minutes
  }

  _headers() {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  isConfigured() {
    return !!this.token;
  }

  // --- Contact operations ---

  async getContact(contactId, properties = []) {
    const params = properties.length ? `?properties=${properties.join(',')}` : '';
    const response = await axios.get(
      `${HS_API_BASE}/crm/v3/objects/contacts/${contactId}${params}`,
      { headers: this._headers() }
    );
    return response.data;
  }

  async updateContact(contactId, properties) {
    const response = await axios.patch(
      `${HS_API_BASE}/crm/v3/objects/contacts/${contactId}`,
      { properties },
      { headers: this._headers() }
    );
    return response.data;
  }

  async searchContacts(filterGroups, properties = [], limit = 100) {
    const response = await axios.post(
      `${HS_API_BASE}/crm/v3/objects/contacts/search`,
      { filterGroups, properties, limit },
      { headers: this._headers() }
    );
    return response.data;
  }

  // --- Company operations ---

  async getCompany(companyId, properties = []) {
    const params = properties.length ? `?properties=${properties.join(',')}` : '';
    const response = await axios.get(
      `${HS_API_BASE}/crm/v3/objects/companies/${companyId}${params}`,
      { headers: this._headers() }
    );
    return response.data;
  }

  async updateCompany(companyId, properties) {
    const response = await axios.patch(
      `${HS_API_BASE}/crm/v3/objects/companies/${companyId}`,
      { properties },
      { headers: this._headers() }
    );
    return response.data;
  }

  // --- List operations ---

  async getLists() {
    const allLists = [];
    let offset = 0;

    // POST /crm/v3/lists/search with empty query returns all lists
    while (true) {
      const response = await axios.post(
        `${HS_API_BASE}/crm/v3/lists/search`,
        {
          query: '',
          count: 100,
          offset,
        },
        { headers: this._headers() }
      );

      const lists = response.data.lists || [];
      for (const l of lists) {
        allLists.push({
          listId: String(l.listId),
          name: l.name,
          type: l.processingType,
          size: l.size || 0,
        });
      }

      if (!response.data.hasMore || lists.length === 0) break;
      offset = response.data.offset;
    }

    return allLists;
  }

  async getListMembers(listId, limit = 100) {
    const response = await axios.get(
      `${HS_API_BASE}/crm/v3/lists/${listId}/memberships`,
      {
        headers: this._headers(),
        params: { limit },
      }
    );
    return response.data;
  }

  // --- Owner operations ---

  async getOwner(ownerId) {
    // Check cache first
    const cached = this._ownerCache[ownerId];
    if (cached && (Date.now() - cached.cachedAt) < this._ownerCacheTTL) {
      return cached.data;
    }

    const response = await axios.get(
      `${HS_API_BASE}/crm/v3/owners/${ownerId}`,
      { headers: this._headers() }
    );

    this._ownerCache[ownerId] = { data: response.data, cachedAt: Date.now() };
    return response.data;
  }

  // Resolve a record's owner to their email
  async getOwnerEmail(ownerId) {
    if (!ownerId) return null;
    const owner = await this.getOwner(ownerId);
    return owner?.email || null;
  }

  // --- Property setup ---

  async createPropertyGroup(objectType, groupName, label) {
    try {
      await axios.post(
        `${HS_API_BASE}/crm/v3/properties/${objectType}/groups`,
        { name: groupName, label, displayOrder: -1 },
        { headers: this._headers() }
      );
      return { status: 'created' };
    } catch (err) {
      return { status: 'skipped', reason: err.response?.data?.message || err.message };
    }
  }

  async createProperty(objectType, { name, label, type = 'string', fieldType = 'text', groupName }) {
    try {
      await axios.post(
        `${HS_API_BASE}/crm/v3/properties/${objectType}`,
        { name, label, type, fieldType, groupName },
        { headers: this._headers() }
      );
      return { property: name, status: 'created' };
    } catch (err) {
      return { property: name, status: 'skipped', reason: err.response?.data?.message || err.message };
    }
  }

  // Setup all Orchestrator properties
  async setupProperties() {
    const results = [];

    // Contact property group
    results.push(await this.createPropertyGroup('contacts', 'orchestrator', 'Orchestrator'));

    // Contact properties
    const contactProps = [
      { name: 'orch_treatment_status', label: 'Orch: Treatment Status' },
      { name: 'orch_treatment_protocol', label: 'Orch: Treatment Protocol' },
      { name: 'orch_linkedin_status', label: 'Orch: LinkedIn Status' },
      { name: 'orch_enrichment_status', label: 'Orch: Enrichment Status' },
      { name: 'orch_last_processed', label: 'Orch: Last Processed' },
      { name: 'orch_actor_id', label: 'Orch: Actor ID' },
    ];

    for (const prop of contactProps) {
      results.push(await this.createProperty('contacts', { ...prop, groupName: 'orchestrator' }));
    }

    // Company property group
    results.push(await this.createPropertyGroup('companies', 'orchestrator', 'Orchestrator'));

    // Company properties
    const companyProps = [
      { name: 'orch_sumble_crm_techs', label: 'Orch: CRM Technologies' },
      { name: 'orch_sumble_marketing_techs', label: 'Orch: Marketing Technologies' },
      { name: 'orch_sumble_sfa_techs', label: 'Orch: SFA Technologies' },
      { name: 'orch_sumble_sales_techs', label: 'Orch: Sales Technologies' },
      { name: 'orch_sumble_linkedin_url', label: 'Orch: LinkedIn Company URL' },
      { name: 'orch_last_enriched', label: 'Orch: Last Enriched' },
    ];

    for (const prop of companyProps) {
      results.push(await this.createProperty('companies', { ...prop, groupName: 'orchestrator' }));
    }

    return results;
  }

  // --- Sequence enrollment ---

  async enrollInSequence(sequenceId, contactEmail, senderEmail) {
    // Enterprise-only feature
    try {
      const response = await axios.post(
        `${HS_API_BASE}/automation/v4/sequences/${sequenceId}/enrollments`,
        {
          contactProperties: { email: contactEmail },
          senderProperties: { email: senderEmail },
        },
        { headers: this._headers() }
      );
      return { success: true, data: response.data };
    } catch (err) {
      return {
        success: false,
        error: err.response?.data?.message || err.message,
        category: err.response?.data?.category,
      };
    }
  }
}

module.exports = new HubSpotClient();
