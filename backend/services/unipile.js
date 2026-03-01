const axios = require('axios');

class UnipileClient {
  constructor() {
    this.apiKey = process.env.UNIPILE_API_KEY;
    this.dsn = process.env.UNIPILE_DSN;
  }

  _headers() {
    return {
      'X-API-KEY': this.apiKey,
      'accept': 'application/json',
      'content-type': 'application/json',
    };
  }

  _baseUrl() {
    return `https://${this.dsn}/api/v1`;
  }

  isConfigured() {
    return !!(this.apiKey && this.dsn);
  }

  // Search LinkedIn by name/keywords
  async search(accountId, { firstname, lastname, company }) {
    const keywords = [firstname, lastname].filter(Boolean).join(' ');
    const url = `${this._baseUrl()}/linkedin/search?account_id=${accountId}`;

    const response = await axios.post(url, {
      api: 'classic',
      category: 'people',
      keywords,
    }, { headers: this._headers() });

    return response.data?.items || [];
  }

  // Get full LinkedIn profile (includes network_distance)
  async getProfile(accountId, providerId) {
    const url = `${this._baseUrl()}/users/${encodeURIComponent(providerId)}?account_id=${accountId}`;
    const response = await axios.get(url, { headers: this._headers() });
    return response.data;
  }

  // Check if invite is pending for a provider_id
  async getInviteStatus(accountId, providerId) {
    const url = `${this._baseUrl()}/users/invite/sent?account_id=${accountId}`;
    const response = await axios.get(url, { headers: this._headers() });
    const items = response.data?.items || [];
    return items.some(item => item.invited_user_id === providerId);
  }

  // Send connection request
  async sendInvite(accountId, providerId, message) {
    const url = `${this._baseUrl()}/users/invite`;
    const response = await axios.post(url, {
      provider_id: providerId,
      account_id: accountId,
      message: message || '',
    }, { headers: this._headers() });
    return response.data;
  }

  // Send LinkedIn message (1st degree only)
  async sendMessage(accountId, attendeeId, text) {
    const url = `${this._baseUrl()}/chats`;
    const response = await axios.post(url, {
      account_id: accountId,
      text,
      attendees_ids: [attendeeId],
    }, { headers: this._headers() });
    return response.data;
  }
}

module.exports = new UnipileClient();
