// The only place that touches the Anthropic SDK. Required lazily so a server
// without ANTHROPIC_API_KEY (or a test with a fake client) never loads it.
const MAX_RETRIES = 1;

function createAnthropicClient({ apiKey, baseURL, timeoutMs }) {
  const Anthropic = require('@anthropic-ai/sdk');
  // apiKey is passed explicitly so the SDK never falls back to ANTHROPIC_AUTH_TOKEN
  // or a credentials profile. baseURL comes from server env only, never from a user.
  return new Anthropic({ apiKey, baseURL: baseURL ?? undefined, timeout: timeoutMs, maxRetries: MAX_RETRIES });
}

module.exports = { createAnthropicClient, MAX_RETRIES };
