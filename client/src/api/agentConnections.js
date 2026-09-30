import { ApiError, KINDS, classifyStatus } from './errors.js';
import { beginRequest, endRequest } from './activity.js';
import { probeReachability } from './probe.js';

const PATH = '/api/agent-connections';
const CAPABILITIES = ['planner_read', 'planner_write', 'notifications', 'export'];

function validateStatus(data) {
  const flags = ['enabled', 'configured', 'linked', 'requiresReenrollment'];
  const valid = data && flags.every(key => typeof data[key] === 'boolean')
    && (data.publicUrl === null || (typeof data.publicUrl === 'string' && data.publicUrl.length <= 2048))
    && (data.revokedAt === null || (typeof data.revokedAt === 'string' && data.revokedAt.length <= 64))
    && Array.isArray(data.capabilities) && data.capabilities.length <= CAPABILITIES.length
    && data.capabilities.every(value => CAPABILITIES.includes(value));
  if (!valid) throw new ApiError(KINDS.UNKNOWN);
  return data;
}

async function readResponse(response) {
  if (response.type === 'opaqueredirect' || response.status === 0) {
    throw new ApiError(KINDS.ACCESS_EXPIRED);
  }
  const requestId = response.headers.get('X-Request-Id');
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const kind = data === null && response.status >= 500 ? KINDS.GATEWAY : classifyStatus(response.status);
    const message = typeof data?.error === 'string' ? data.error : undefined;
    throw new ApiError(kind, { status: response.status, requestId, message });
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new ApiError(KINDS.UNKNOWN, { requestId });
  return data;
}

async function performRequest(fetchImpl, probe, method, body) {
  let response;
  try {
    response = await fetchImpl(PATH, {
      method, credentials: 'same-origin', cache: 'no-store', redirect: 'manual',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError(await probe());
  }
  return readResponse(response);
}

export function createAgentConnectionsApi({ fetchImpl = (...args) => fetch(...args), probe = probeReachability } = {}) {
  async function request(method, body) {
    beginRequest();
    try {
      return await performRequest(fetchImpl, probe, method, body);
    } finally {
      endRequest();
    }
  }
  return {
    getStatus: async () => validateStatus(await request('GET')),
    enroll: async (password, consent, capabilities = ['planner_read']) => {
      if (typeof password !== 'string' || !password || password.length > 128 || consent !== true
        || !Array.isArray(capabilities) || !capabilities.includes('planner_read')
        || new Set(capabilities).size !== capabilities.length || capabilities.some(value => !CAPABILITIES.includes(value))) {
        throw new ApiError(KINDS.BAD_REQUEST, { message: 'Enter your current password and confirm consent.' });
      }
      return request('POST', { password, consent, capabilities });
    },
    disable: () => request('DELETE', {}),
  };
}

export const agentConnections = createAgentConnectionsApi();
