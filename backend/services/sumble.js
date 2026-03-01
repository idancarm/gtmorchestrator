const axios = require('axios');

const SUMBLE_API_BASE = 'https://api.sumble.com';

const TECH_GROUPS = {
  sumble_crm_techs: [
    'salesforce', 'hubspot', 'microsoft-dynamics-365', 'dynamics-365',
    'zoho-crm', 'pipedrive', 'freshsales', 'sugarcrm', 'insightly',
    'copper', 'close', 'nutshell', 'monday-sales-crm',
  ],
  sumble_marketing_techs: [
    'hubspot-marketing-hub', 'marketo', 'pardot', 'mailchimp',
    'activecampaign', 'eloqua', 'klaviyo', 'brevo', 'sendinblue',
    'customer-io', 'drip', 'iterable', 'autopilot',
  ],
  sumble_sfa_techs: [
    'outreach', 'salesloft', 'gong', 'chorus-ai', 'apollo-io',
    'zoominfo', 'lusha', 'cognism', 'seamless-ai', 'clari',
    'groove', 'xactly',
  ],
  sumble_sales_techs: [
    'linkedin-sales-navigator', 'vidyard', 'docusign', 'pandadoc',
    'calendly', 'drift', 'intercom', 'loom', 'bombora', 'clearbit',
    'leadfeeder', '6sense',
  ],
};

class SumbleClient {
  constructor() {
    this.apiKey = process.env.SUMBLE_API_KEY;
  }

  _headers() {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
  }

  isConfigured() {
    return !!this.apiKey;
  }

  // Enrich organization technologies (parallel per tech group)
  async enrichOrganization(domain, linkedinUrl, techGroupKeys) {
    const organization = {};
    if (domain) organization.domain = domain;
    else if (linkedinUrl) organization.linkedin_url = linkedinUrl;

    const groupKeys = techGroupKeys || Object.keys(TECH_GROUPS);

    const results = await Promise.allSettled(
      groupKeys.map(propKey =>
        axios.post(
          `${SUMBLE_API_BASE}/v3/organizations/enrich`,
          {
            organization,
            filters: { technologies: TECH_GROUPS[propKey] },
          },
          { headers: this._headers() }
        ).then(response => ({ propKey, data: response.data }))
      )
    );

    const technologiesByCategory = {};
    let orgLinkedinUrl = '';
    let orgData = {};

    for (const result of results) {
      if (result.status === 'rejected') {
        console.log(`Sumble enrich failed for group: ${result.reason?.response?.data?.detail || result.reason?.message}`);
        continue;
      }

      const { propKey, data } = result.value;
      const techs = (data.technologies || []).map(t => t.name);
      if (techs.length > 0) {
        technologiesByCategory[propKey] = techs;
      }

      if (!orgLinkedinUrl && data.organization?.slug) {
        orgData = data.organization;
        orgLinkedinUrl = `https://www.linkedin.com/company/${data.organization.slug}`;
      }
    }

    return { technologiesByCategory, linkedinUrl: orgLinkedinUrl, organization: orgData };
  }

  // Find people at an organization by job function
  async findPeople(domain, linkedinUrl, jobFunction, limit = 10) {
    const organization = {};
    if (domain) organization.domain = domain;
    else if (linkedinUrl) organization.linkedin_url = linkedinUrl;

    const response = await axios.post(
      `${SUMBLE_API_BASE}/v3/people/find`,
      {
        organization,
        filters: { job_functions: [jobFunction] },
        limit,
      },
      { headers: this._headers() }
    );

    return {
      people: response.data.people || [],
      peopleCount: response.data.people_count || 0,
      peopleDataUrl: response.data.people_data_url || '',
    };
  }
}

module.exports = new SumbleClient();
module.exports.TECH_GROUPS = TECH_GROUPS;
