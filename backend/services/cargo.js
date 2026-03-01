const axios = require('axios');

class CargoClient {
  constructor() {
    this.apiKey = process.env.CARGO_API_KEY;
    this.baseUrl = 'https://api.getcargo.io'; // placeholder
  }

  isConfigured() {
    return !!this.apiKey;
  }

  // Stub: enrich company data via Cargo
  async enrichCompany(domain) {
    if (!this.isConfigured()) {
      throw new Error('Cargo API key not configured');
    }
    // TODO: Implement Cargo enrichment when API details are available
    return { provider: 'cargo', domain, data: {} };
  }
}

module.exports = new CargoClient();
