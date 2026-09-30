const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const validationScript = path.join(root, 'client/docker-entrypoint.d/15-validate-mcp-host.sh');

describe('MCP deployment configuration', () => {
  it('aligns container builds and every CI runtime on maintained Node 22', () => {
    for (const file of ['client/Dockerfile', 'server/Dockerfile']) {
      const versions = [...read(file).matchAll(/FROM node:(\d+)-alpine/g)].map(match => match[1]);
      assert.ok(versions.length > 0 && versions.every(version => version === '22'));
    }
    const versions = [...read('.github/workflows/ci.yml').matchAll(/node-version: '([^']+)'/g)].map(match => match[1]);
    assert.ok(versions.length >= 5 && versions.every(version => version === '22'));
  });

  it('defaults both switches off and passes independent origins and audiences in both Compose variants', () => {
    for (const file of ['docker-compose.yml', 'docker-compose.nas.yml']) {
      const compose = read(file);
      for (const key of ['MCP_ENABLED', 'MCP_WRITES_ENABLED']) {
        assert.ok(compose.includes(`${key}: \${${key}:-false}`));
      }
      for (const key of ['MCP_PUBLIC_URL', 'WEB_PUBLIC_ORIGIN', 'CF_ACCESS_ISSUER',
        'CF_ACCESS_MCP_AUD', 'CF_ACCESS_WEB_AUD', 'MCP_ALLOWED_ORIGINS']) {
        assert.ok(compose.includes(`${key}: \${${key}:-}`));
      }
      assert.equal(compose.match(/MCP_HOST: \$\{MCP_HOST:-mcp-disabled\.invalid\}/g)?.length, 2);
      const server = compose.split('\n  client:')[0];
      assert.doesNotMatch(server, /^\s+ports:/m);
      assert.match(server, /\.\/data:\/app\/data/);
    }
  });

  it('renders only the validated MCP hostname without expanding nginx request variables', () => {
    const dockerfile = read('client/Dockerfile');
    assert.match(dockerfile, /NGINX_ENVSUBST_FILTER="\^MCP_HOST\$"/);
    assert.match(dockerfile, /COPY nginx\.conf \/etc\/nginx\/templates\/default\.conf\.template/);
    assert.match(dockerfile, /COPY --chmod=755 docker-entrypoint\.d\/15-validate-mcp-host\.sh/);
    assert.deepEqual([...read('client/nginx.conf').matchAll(/\$\{([^}]+)\}/g)].map(match => match[1]), ['MCP_HOST']);
  });

  it('rejects all noncanonical paths on the MCP host before API or SPA routing', () => {
    const nginx = read('client/nginx.conf');
    assert.match(nginx, /map \$host \$is_mcp_host \{\s*default 0;\s*"\$\{MCP_HOST\}" 1;/);
    assert.match(nginx, /map \$request_uri \$is_mcp_path \{\s*default 0;\s*~\^\/mcp\(\?:\\\?\.\*\)\?\$ 1;/);
    assert.match(nginx, /map "\$is_mcp_host:\$is_mcp_path" \$reject_mcp_path \{\s*default 0;\s*"1:0" 1;/);
    const rejectionIndex = nginx.indexOf('if ($reject_mcp_path) { return 404; }');
    assert.ok(rejectionIndex >= 0 && rejectionIndex < nginx.indexOf('location /api/'));
    assert.match(nginx, /location = \/mcp \{\s*if \(\$is_mcp_host = 0\) \{ return 404; \}/);
  });

  it('preserves security-header inheritance and bounds uncached streaming MCP proxying', () => {
    const nginx = read('client/nginx.conf');
    const block = nginx.split('location = /mcp {')[1]?.split('\n    }')[0];
    assert.ok(block);
    for (const directive of ['proxy_http_version 1.1;', 'proxy_set_header Host $http_host;',
      'proxy_set_header X-Forwarded-Proto $forwarded_proto;', 'proxy_buffering off;',
      'proxy_cache off;', 'proxy_no_cache 1;', 'proxy_cache_bypass 1;', 'client_max_body_size 1m;',
      'proxy_read_timeout 20s;']) assert.ok(block.includes(directive), directive);
    assert.match(nginx, /~\^\/mcp\s+"no-store";/);
    assert.doesNotMatch(nginx.slice(nginx.indexOf('location = /mcp')), /^\s*add_header /m);
    assert.match(nginx, /script-src 'self';/);
    assert.match(nginx, /location \/assets\/ \{\s*try_files \$uri =404;/);
  });
});

describe('MCP hostname entrypoint validation', () => {
  for (const host of ['mcp-disabled.invalid', 'mcp.example.com', 'a-b.example.com']) {
    it(`accepts a canonical hostname: ${host}`, () => {
      assert.equal(spawnSync('sh', [validationScript], { env: { ...process.env, MCP_HOST: host } }).status, 0);
    });
  }
  for (const host of ['', 'MCP.example.com', 'https://mcp.example.com', 'mcp.example.com:443',
    'mcp.example.com/path', 'mcp.example.com;', '${scheme}', '*.example.com', '-mcp.example.com',
    'mcp..example.com', 'mcp.example.com.', `${'a'.repeat(64)}.example.com`, 'private-canary\ninclude /tmp/private;']) {
    it(`rejects invalid host ${JSON.stringify(host)} before nginx startup`, () => {
      const result = spawnSync('sh', [validationScript], { env: { ...process.env, MCP_HOST: host }, encoding: 'utf8' });
      assert.equal(result.status, 1);
      assert.doesNotMatch(result.stderr, /private-canary/);
    });
  }
});
