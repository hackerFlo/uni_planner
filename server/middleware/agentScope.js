// Default-deny scope of the agent sub-account. requireAuth consults this for
// every cookie-authenticated request, so a route added later is closed to the
// agent until it is listed here deliberately.
//
// The list mirrors the MCP tool scope in docs/mcp-capabilities.md, expressed as
// the website routes that serve the same planner features. Anything MCP does not
// offer -- account/security, notification settings, backup export and restore,
// agent connections, version/update, agent-account management, preference
// profile creation -- is absent on purpose.
//
// Patterns are case-sensitive and anchored: an unusual spelling of a path simply
// fails to match and is denied.
const ID = '[^/]+';
const AGENT_ALLOWED = [
  ['GET', '/api/auth/me'],
  // Tasks (list/get/search, create/update/delete, dismiss agent activity)
  ['GET', '/api/todos(?:/archived|/completed)?'],
  ['POST', '/api/todos'],
  ['PATCH', `/api/todos/${ID}`],
  ['DELETE', `/api/todos/${ID}`],
  ['POST', `/api/todos/${ID}/dismiss-agent-activity`],
  // Lists, including reorder_lists
  ['GET', '/api/lists'],
  ['POST', '/api/lists'],
  ['PATCH', `/api/lists/${ID}`],
  ['DELETE', `/api/lists/${ID}`],
  // Board: move/copy/reorder, dividers, undo
  ['GET', '/api/planner/version'],
  ['POST', '/api/planner/(?:undo|move|copy|reorder|create-divider|delete-divider)'],
  ['GET', '/api/day-dividers'],
  ['POST', '/api/day-dividers'],
  ['PATCH', `/api/day-dividers/${ID}`],
  ['DELETE', `/api/day-dividers/${ID}`],
  // Day notes, exams, holidays
  ['GET', '/api/day-notes'],
  ['PUT', `/api/day-notes/${ID}`],
  ['GET', '/api/exams'],
  ['POST', '/api/exams'],
  ['PATCH', `/api/exams/${ID}`],
  ['DELETE', `/api/exams/${ID}`],
  ['GET', '/api/holidays(?:/countries)?'],
  // Quotes
  ['GET', '/api/quotes/(?:today|stats)'],
  ['POST', '/api/quotes/(?:restore-all|import)'],
  ['POST', `/api/quotes/${ID}/(?:dislike|restore)`],
  // Preferences: MCP reads, updates and resets profiles but cannot create one
  ['GET', `/api/preferences/profiles(?:/${ID})?`],
  ['PATCH', `/api/preferences/profiles/${ID}`],
  ['POST', `/api/preferences/profiles/${ID}/reset`],
].map(([method, pattern]) => ({ method, pattern: new RegExp(`^${pattern}/?$`) }));

const FORBIDDEN_BODY = Object.freeze({ error: 'Not available to the agent account', code: 'AGENT_FORBIDDEN' });

function isAgentAllowed(method, originalUrl) {
  const path = originalUrl.split('?')[0];
  return AGENT_ALLOWED.some(rule => rule.method === method && rule.pattern.test(path));
}

const sendAgentForbidden = res => res.status(403).json(FORBIDDEN_BODY);

module.exports = { isAgentAllowed, sendAgentForbidden, AGENT_ALLOWED };
