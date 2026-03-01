const axios = require('axios');

class CopyGenerator {
  constructor() {
    this.apiKey = process.env.ANTHROPIC_API_KEY;
    this.model = 'claude-sonnet-4-6';
  }

  isConfigured() {
    return !!this.apiKey;
  }

  async generate({ type, contactContext, actorContext, messagingBlocks, brandVoice, customInstructions }) {
    if (!this.isConfigured()) {
      throw new Error('AI API key not configured');
    }

    const systemPrompt = this._buildSystemPrompt(type, actorContext, brandVoice);
    const userPrompt = this._buildUserPrompt(type, contactContext, messagingBlocks, customInstructions);

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: this.model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      },
      {
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
      }
    );

    const generatedText = response.data.content?.[0]?.text || '';
    return {
      copy: generatedText,
      tokenPlaceholders: this._extractPlaceholders(generatedText),
      usage: response.data.usage,
    };
  }

  _buildSystemPrompt(type, actorContext, brandVoice) {
    const typeInstructions = {
      connection_request: 'Write a short LinkedIn connection request message (max 300 chars). Be personal, reference something specific about the recipient. Do NOT be salesy.',
      linkedin_message: 'Write a LinkedIn direct message. Keep it conversational, professional, and concise (2-3 short paragraphs max).',
      sales_email: 'Write a sales email. Include a clear subject line on the first line prefixed with "Subject: ". Keep it concise and focused on value.',
      marketing_email: 'Write a marketing email. Include a clear subject line on the first line prefixed with "Subject: ". Be engaging and informative.',
    };

    let prompt = `You are a professional copywriter helping a sales team craft outreach messages.\n\n`;
    prompt += typeInstructions[type] || typeInstructions.linkedin_message;
    prompt += '\n\n';

    if (actorContext) {
      prompt += `The sender is: ${actorContext.name || 'Unknown'}`;
      if (actorContext.title) prompt += `, ${actorContext.title}`;
      if (actorContext.company) prompt += ` at ${actorContext.company}`;
      prompt += '.\n\n';
    }

    if (brandVoice) {
      prompt += `Brand voice guidelines: ${brandVoice}\n\n`;
    }

    prompt += 'Use {{token}} placeholders for personalization (e.g., {{firstname}}, {{company}}, {{jobtitle}}) where appropriate. Output ONLY the message text.';

    return prompt;
  }

  _buildUserPrompt(type, contactContext, messagingBlocks, customInstructions) {
    let prompt = '';

    if (contactContext) {
      prompt += 'Recipient context:\n';
      if (contactContext.firstname) prompt += `- Name: ${contactContext.firstname} ${contactContext.lastname || ''}\n`;
      if (contactContext.company) prompt += `- Company: ${contactContext.company}\n`;
      if (contactContext.jobtitle) prompt += `- Title: ${contactContext.jobtitle}\n`;
      if (contactContext.industry) prompt += `- Industry: ${contactContext.industry}\n`;
      if (contactContext.techStack) prompt += `- Tech stack: ${contactContext.techStack}\n`;
      prompt += '\n';
    }

    if (messagingBlocks && messagingBlocks.length > 0) {
      prompt += 'Key messaging points to incorporate:\n';
      for (const block of messagingBlocks) {
        prompt += `- ${block}\n`;
      }
      prompt += '\n';
    }

    if (customInstructions) {
      prompt += `Additional instructions: ${customInstructions}\n`;
    }

    return prompt || 'Generate a professional outreach message.';
  }

  _extractPlaceholders(text) {
    const matches = text.match(/\{\{(\w+)\}\}/g) || [];
    return [...new Set(matches.map(m => m.replace(/[{}]/g, '')))];
  }

  // Resolve token placeholders with actual values
  resolveTokens(text, properties) {
    return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return properties[key] || match;
    });
  }
}

module.exports = new CopyGenerator();
