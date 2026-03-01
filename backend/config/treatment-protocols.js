// Default protocol templates that can be cloned and customized
const PROTOCOL_TEMPLATES = {
  'linkedin-outreach-enrich': {
    name: 'LinkedIn Outreach + Enrich',
    description: 'Enrich company data, find LinkedIn profile, check connection, send request, enroll in sequence',
    steps: [
      { type: 'enrich', provider: 'sumble', params: { techGroups: ['sumble_crm_techs', 'sumble_marketing_techs', 'sumble_sfa_techs', 'sumble_sales_techs'] } },
      { type: 'linkedin_search', params: { useProfileUrl: true, fallbackToName: true } },
      { type: 'check_connection', params: {} },
      { type: 'send_connection_request', params: { messageTemplate: '' } },
      { type: 'enroll_sequence', params: { sequenceId: '' } },
    ],
  },
  'enrich-only': {
    name: 'Enrich Only',
    description: 'Enrich company with tech stack and LinkedIn data via Sumble',
    steps: [
      { type: 'enrich', provider: 'sumble', params: { techGroups: ['sumble_crm_techs', 'sumble_marketing_techs', 'sumble_sfa_techs', 'sumble_sales_techs'] } },
    ],
  },
  'linkedin-connect': {
    name: 'LinkedIn Connect',
    description: 'Find LinkedIn profile and send connection request',
    steps: [
      { type: 'linkedin_search', params: { useProfileUrl: true, fallbackToName: true } },
      { type: 'check_connection', params: {} },
      { type: 'send_connection_request', params: { messageTemplate: '' } },
    ],
  },
};

// Valid step types for validation
const VALID_STEP_TYPES = [
  'enrich',
  'linkedin_search',
  'check_connection',
  'send_connection_request',
  'send_message',
  'enroll_sequence',
  'generate_copy',
];

module.exports = { PROTOCOL_TEMPLATES, VALID_STEP_TYPES };
