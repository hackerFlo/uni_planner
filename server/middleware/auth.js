const jwt = require('jsonwebtoken');
const db = require('../db');
const { log } = require('../logger');
const { SESSION_COOKIE_NAME } = require('../config');
const { findLiveSession } = require('../sessions');
const { isAgentAllowed, sendAgentForbidden } = require('./agentScope');

let selectTokenVersion;
let selectAgentAccount;

// An agent token names the OWNER in `id` (the data being worked on) and the agent
// account in `aid`. The agent's own token_version, disabled flag and session row
// are what keep it alive; the owner's token_version deliberately is not.
function authenticateAgent(payload) {
  selectAgentAccount ??= db.prepare('SELECT token_version, disabled FROM agent_accounts WHERE id = ? AND owner_user_id = ?');
  const agent = selectAgentAccount.get(payload.aid, payload.id);
  if (!agent) return 'agent-missing';
  if (agent.disabled) return 'agent-disabled';
  if ((payload.tv ?? 0) !== agent.token_version) return 'token-version-mismatch';
  if (!findLiveSession(payload.sid, payload.id, { agentAccountId: payload.aid })) return 'session-revoked';
  return null;
}

function authenticateOwner(payload) {
  selectTokenVersion ??= db.prepare('SELECT token_version FROM users WHERE id = ?');
  const user = selectTokenVersion.get(payload.id);
  if (!user) return 'user-missing';
  if ((payload.tv ?? 0) !== user.token_version) return 'token-version-mismatch';
  // The per-device half. A token whose session row is gone was signed out on
  // that device specifically; other devices keep their own rows and their own
  // access. Tokens minted before sessions existed carry no `sid` and fail here,
  // which costs one re-login rather than leaving them permanently unrevocable.
  if (!findLiveSession(payload.sid, payload.id)) return payload.sid ? 'session-revoked' : 'session-missing';
  return null;
}

function requireAuth(req, res, next) {
  const rlog = req.log || log;
  // Cookie only. An Authorization: Bearer fallback used to be accepted here,
  // but nothing sends one (client/src/api/client.js is cookie-only) and it let a
  // caller bypass the SameSite protection the session cookie depends on.
  const token = req.cookies?.[SESSION_COOKIE_NAME];

  if (!token) {
    // Method and path only -- never the cookie, header or token (AR-6).
    rlog.warn('auth rejected', { reason: 'no-token', method: req.method, path: req.originalUrl.split('?')[0] });
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Pinning the algorithm is defence in depth, not a live hole: jsonwebtoken
    // v9 already rejects `alg: none` and refuses an asymmetric alg against a
    // string secret. It costs nothing and survives a future dependency change.
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    const isAgent = payload.aid !== undefined;
    const failure = isAgent ? authenticateAgent(payload) : authenticateOwner(payload);
    if (failure) {
      // A password or email change bumps token_version, so every session lands
      // here. Silent until now, which made "it logged me out" unreadable.
      rlog.warn('auth rejected', { reason: failure, userId: payload.id });
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    req.principal = isAgent ? { kind: 'agent', agentAccountId: payload.aid } : { kind: 'owner' };
    if (isAgent && !isAgentAllowed(req.method, req.originalUrl)) {
      rlog.warn('agent request denied', { method: req.method, path: req.originalUrl.split('?')[0], userId: payload.id });
      return sendAgentForbidden(res);
    }
    req.user = payload;
    next();
  } catch (err) {
    rlog.warn('auth rejected', { reason: 'jwt-verify-failed', err });
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = requireAuth;
