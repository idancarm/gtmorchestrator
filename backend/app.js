require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(bodyParser.json());

// Routes
app.use('/api/actors', require('./routes/actors'));
app.use('/api/treatments', require('./routes/treatments'));
app.use('/api/queue', require('./routes/queue'));
app.use('/api/enrich', require('./routes/enrich'));
app.use('/api/linkedin', require('./routes/linkedin'));
app.use('/api/sequences', require('./routes/sequences'));
app.use('/api/copy', require('./routes/copy'));
app.use('/api/onboarding', require('./routes/onboarding'));

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'The Orchestrator Backend' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'The Orchestrator Backend' });
});

module.exports = app;
