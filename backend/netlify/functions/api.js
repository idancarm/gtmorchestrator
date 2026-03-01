const serverless = require('serverless-http');
const { connectLambda } = require('@netlify/blobs');
const app = require('../../app');

const handler = serverless(app);

module.exports.handler = async (event, context) => {
  connectLambda(event);
  return handler(event, context);
};
