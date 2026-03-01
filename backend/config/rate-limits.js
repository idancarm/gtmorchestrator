const DAILY_LIMITS = {
  connection_requests: 20,
  messages: 50,
  profile_views: 80,
  searches: 30,
};

const HOURLY_LIMITS = {
  connection_requests: 5,
  messages: 10,
  profile_views: 15,
  searches: 8,
};

const MIN_DELAY_BETWEEN_ACTIONS_MS = 30000; // 30 seconds minimum

module.exports = { DAILY_LIMITS, HOURLY_LIMITS, MIN_DELAY_BETWEEN_ACTIONS_MS };
