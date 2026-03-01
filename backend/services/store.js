const { getStore } = require('@netlify/blobs');

// Lazy-initialized stores (connectLambda must be called first in the function handler)
function getActorsStore() {
  return getStore({ name: 'actors', consistency: 'strong' });
}

function getProtocolsStore() {
  return getStore({ name: 'protocols', consistency: 'strong' });
}

function getTreatmentRunsStore() {
  return getStore({ name: 'treatment-runs', consistency: 'strong' });
}

function getQueueItemsStore() {
  return getStore({ name: 'queue-items', consistency: 'strong' });
}

module.exports = {
  getActorsStore,
  getProtocolsStore,
  getTreatmentRunsStore,
  getQueueItemsStore,
};
