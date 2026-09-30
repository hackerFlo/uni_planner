const ASSERTION_HEADER = 'cf-access-jwt-assertion';
const MAX_ASSERTION_LENGTH = 16384;
const CLOCK_TOLERANCE_SECONDS = 30;
const JWKS_OPTIONS = Object.freeze({ timeoutDuration: 5000, cooldownDuration: 30000, cacheMaxAge: 600000 });

class AccessAuthError extends Error {
  constructor() {
    super('Authentication required');
    this.name = 'AccessAuthError';
    this.code = 'AUTH_REQUIRED';
    this.status = 401;
  }
}

function assertionHeader(req) {
  const token = req?.headers?.[ASSERTION_HEADER];
  if (typeof token !== 'string' || token.length > MAX_ASSERTION_LENGTH ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw new AccessAuthError();
  const raw = req.rawHeaders || [];
  let count = 0;
  for (let index = 0; index < raw.length; index += 2) {
    if (String(raw[index]).toLowerCase() === ASSERTION_HEADER) count += 1;
  }
  if (count > 1) throw new AccessAuthError();
  return token;
}

function validateIdentity(payload) {
  const now = Math.floor(Date.now() / 1000);
  if (payload.type !== 'app' || Object.hasOwn(payload, 'common_name') ||
      typeof payload.sub !== 'string' || !/^[!-~]{1,256}$/.test(payload.sub)) {
    throw new AccessAuthError();
  }
  if (!Number.isSafeInteger(payload.iat) || payload.iat < 0 || payload.iat > now + CLOCK_TOLERANCE_SECONDS ||
      !Number.isSafeInteger(payload.exp) || payload.exp <= payload.iat) throw new AccessAuthError();
  if (payload.nbf !== undefined && (!Number.isSafeInteger(payload.nbf) || payload.nbf < 0 ||
      payload.nbf >= payload.exp)) throw new AccessAuthError();
}

function createAccessVerifier(config, options = {}) {
  let resolver = options.keyResolver;
  return async function verifyAssertion(req, audience = config.mcpAudience) {
    try {
      if (!config.enabled || !audience || ![config.mcpAudience, config.webAudience].includes(audience)) {
        throw new AccessAuthError();
      }
      const token = assertionHeader(req);
      const { jwtVerify, createRemoteJWKSet } = await import('jose');
      resolver ||= createRemoteJWKSet(new URL(`${config.issuer}/cdn-cgi/access/certs`), JWKS_OPTIONS);
      const { payload } = await jwtVerify(token, resolver, {
        algorithms: ['RS256'], issuer: config.issuer, audience,
        requiredClaims: ['iss', 'aud', 'exp', 'iat', 'sub', 'type'], clockTolerance: CLOCK_TOLERANCE_SECONDS,
      });
      validateIdentity(payload);
      return Object.freeze({ issuer: payload.iss, subject: payload.sub });
    } catch {
      // Library errors can contain assertion claims or upstream responses.
      throw new AccessAuthError();
    }
  };
}

module.exports = { createAccessVerifier, AccessAuthError };
