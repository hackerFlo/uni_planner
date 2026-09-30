class McpConfigError extends Error {
  constructor() {
    super('Invalid MCP configuration');
    this.name = 'McpConfigError';
  }
}

function flag(value) {
  if (value === undefined || value === 'false') return false;
  if (value !== 'true') throw new McpConfigError();
  return true;
}

function httpsUrl(value, path) {
  if (typeof value !== 'string' || value.length > 2048 || /[\s\\?#%]/.test(value)) {
    throw new McpConfigError();
  }
  let url;
  try { url = new URL(value); } catch { throw new McpConfigError(); }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== path) {
    throw new McpConfigError();
  }
  const canonical = path === '/' ? url.origin : `${url.origin}${path}`;
  if (value !== canonical && !(path === '/' && value === `${canonical}/`)) throw new McpConfigError();
  return canonical;
}

function audience(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(value)) throw new McpConfigError();
  return value;
}

function origins(value) {
  if (typeof value !== 'string' || value.length > 8192) throw new McpConfigError();
  const parts = value.split(',');
  if (parts.length > 16) throw new McpConfigError();
  return Object.freeze([...new Set(parts.map(part => httpsUrl(part.trim(), '/')))]);
}

function enabledConfig(env) {
  const publicUrl = httpsUrl(env.MCP_PUBLIC_URL, '/mcp');
  if (env.MCP_HOST !== undefined && env.MCP_HOST !== new URL(publicUrl).hostname) throw new McpConfigError();
  const webOrigin = httpsUrl(env.WEB_PUBLIC_ORIGIN, '/');
  const issuer = httpsUrl(env.CF_ACCESS_ISSUER, '/');
  if (!/^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$/.test(issuer)) {
    throw new McpConfigError();
  }
  const mcpAudience = audience(env.CF_ACCESS_MCP_AUD);
  const webAudience = audience(env.CF_ACCESS_WEB_AUD);
  if (mcpAudience === webAudience || new URL(publicUrl).hostname === new URL(webOrigin).hostname) {
    throw new McpConfigError();
  }
  return Object.freeze({ enabled: true, writesEnabled: flag(env.MCP_WRITES_ENABLED), publicUrl,
    webOrigin, issuer, mcpAudience, webAudience, allowedOrigins: origins(env.MCP_ALLOWED_ORIGINS) });
}

function parseMcpConfig(env = process.env) {
  if (flag(env.MCP_ENABLED)) return enabledConfig(env);
  const webOrigin = env.WEB_PUBLIC_ORIGIN ? httpsUrl(env.WEB_PUBLIC_ORIGIN, '/') : null;
  return Object.freeze({ enabled: false, writesEnabled: false, publicUrl: null, webOrigin,
    issuer: null, mcpAudience: null, webAudience: null, allowedOrigins: Object.freeze([]) });
}

module.exports = { parseMcpConfig, McpConfigError };
