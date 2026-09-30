const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseMcpConfig } = require('./config');

const valid = {
  MCP_ENABLED: 'true', MCP_PUBLIC_URL: 'https://mcp.example.com/mcp',
  WEB_PUBLIC_ORIGIN: 'https://planner.example.com',
  CF_ACCESS_ISSUER: 'https://example-team.cloudflareaccess.com',
  CF_ACCESS_MCP_AUD: 'mcp-audience', CF_ACCESS_WEB_AUD: 'web-audience',
  MCP_ALLOWED_ORIGINS: 'https://mcp.example.com',
};

describe('parseMcpConfig', () => {
  it('defaults off and ignores unused deployment settings', () => {
    assert.deepEqual(parseMcpConfig({ MCP_PUBLIC_URL: 'bad', MCP_WRITES_ENABLED: 'true' }), {
      enabled: false, writesEnabled: false, publicUrl: null, webOrigin: null,
      issuer: null, mcpAudience: null, webAudience: null, allowedOrigins: [],
    });
  });
  it('parses a complete read-only configuration', () => {
    const config = parseMcpConfig(valid);
    assert.deepEqual(config, {
      enabled: true, writesEnabled: false, publicUrl: valid.MCP_PUBLIC_URL,
      webOrigin: valid.WEB_PUBLIC_ORIGIN, issuer: valid.CF_ACCESS_ISSUER,
      mcpAudience: 'mcp-audience', webAudience: 'web-audience',
      allowedOrigins: ['https://mcp.example.com'],
    });
    assert.ok(Object.isFrozen(config) && Object.isFrozen(config.allowedOrigins));
  });
  it('requires an explicit write switch', () => {
    assert.equal(parseMcpConfig({ ...valid, MCP_WRITES_ENABLED: 'true' }).writesEnabled, true);
  });
  it('requires an explicitly supplied nginx hostname to match the MCP URL', () => {
    assert.throws(() => parseMcpConfig({ ...valid, MCP_HOST: 'different.example.com' }), /MCP configuration/);
    assert.equal(parseMcpConfig({ ...valid, MCP_HOST: 'mcp.example.com' }).enabled, true);
  });
  it('preserves the website origin for revocation after disabling MCP', () => {
    const config = parseMcpConfig({ MCP_ENABLED: 'false', WEB_PUBLIC_ORIGIN: valid.WEB_PUBLIC_ORIGIN });
    assert.equal(config.webOrigin, valid.WEB_PUBLIC_ORIGIN);
    assert.equal(config.enabled, false);
  });
  it('still rejects an unsafe configured revocation origin while disabled', () => {
    assert.throws(() => parseMcpConfig({ WEB_PUBLIC_ORIGIN: 'https://planner.example.com/path' }), /MCP configuration/);
  });
  for (const key of Object.keys(valid).filter(key => key !== 'MCP_ENABLED')) {
    it(`rejects missing ${key}`, () => {
      assert.throws(() => parseMcpConfig({ ...valid, [key]: undefined }), /MCP configuration/);
    });
  }
  for (const key of ['MCP_ENABLED', 'MCP_WRITES_ENABLED']) {
    for (const value of ['yes', 'TRUE', '1', true, '']) {
      it(`rejects ambiguous ${key} ${JSON.stringify(value)}`, () => {
        assert.throws(() => parseMcpConfig({ ...valid, [key]: value }), /MCP configuration/);
      });
    }
  }
  const invalid = {
    MCP_PUBLIC_URL: ['http://mcp.example.com/mcp', 'https://a:b@mcp.example.com/mcp',
      'https://mcp.example.com/mcp/', 'https://mcp.example.com/a/../mcp',
      'https://mcp.example.com/%6dcp', 'https://mcp.example.com/mcp?',
      'https://mcp.example.com/mcp#', 'https://mcp.example.com/mcp?q=x',
      'https://planner.example.com/mcp', 'https://mcp.example.com\\mcp'],
    WEB_PUBLIC_ORIGIN: ['http://planner.example.com', 'https://planner.example.com/app'],
    CF_ACCESS_ISSUER: ['https://example.com', 'http://team.cloudflareaccess.com',
      'https://team.cloudflareaccess.com.evil.example', 'https://a.b.cloudflareaccess.com',
      'https://team.cloudflareaccess.com:444', 'https://team.cloudflareaccess.com/path'],
    CF_ACCESS_MCP_AUD: ['web-audience', '', 'x'.repeat(257), 'a b'],
    MCP_ALLOWED_ORIGINS: ['*', 'null', 'https://mcp.example.com/path',
      'http://mcp.example.com', 'https://mcp.example.com,', Array(18).fill('https://x.example.com').join(',')],
  };
  for (const [key, values] of Object.entries(invalid)) {
    for (const value of values) {
      it(`rejects unsafe ${key}: ${value.slice(0,75)}`, () => {
        assert.throws(() => parseMcpConfig({ ...valid, [key]: value }), /MCP configuration/);
      });
    }
  }
  it('normalizes origin slashes and deduplicates a bounded explicit allowlist', () => {
    assert.deepEqual(parseMcpConfig({ ...valid, WEB_PUBLIC_ORIGIN: 'https://planner.example.com/',
      MCP_ALLOWED_ORIGINS: 'https://mcp.example.com/, https://client.example.com,https://mcp.example.com',
    }).allowedOrigins, ['https://mcp.example.com', 'https://client.example.com']);
  });
  it('never includes submitted configuration in errors', () => {
    assert.throws(() => parseMcpConfig({ ...valid, CF_ACCESS_ISSUER: 'private-canary' }),
      error => !error.message.includes('private-canary') && !error.cause);
  });
});
