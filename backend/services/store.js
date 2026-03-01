const { getStore } = require('@netlify/blobs');

// Lazy-initialized stores (connectLambda must be called first in the function handler)
// Using eventual consistency (propagates within 60s) - works without extra config
function getActorsStore() {
  return getStore('actors');
}

function getProtocolsStore() {
  return getStore('protocols');
}

function getTreatmentRunsStore() {
  return getStore('treatment-runs');
}

function getQueueItemsStore() {
  return getStore('queue-items');
}

module.exports = {
  getActorsStore,
  getProtocolsStore,
  getTreatmentRunsStore,
  getQueueItemsStore,
};
