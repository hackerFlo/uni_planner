const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// A separate process detects Express 4 async rejection without killing the suite.
test('revocation while the authenticated request body is streaming fails closed without unhandled rejection', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-security-review-'));
  try {
    const script = `
      const http = require('node:http');
      const express = require('express');
      const db = require('./db');
      const { createLinkService } = require('./mcp/links');
      const { createMcpRouter } = require('./mcp/router');
      const { createListService } = require('./services/lists');
      process.on('unhandledRejection', () => { process.stdout.write('UNHANDLED_PROTOCOL_REJECTION'); process.exit(42); });
      setTimeout(() => process.exit(43), 3000).unref();
      const userId = db.prepare('INSERT INTO users(email,password_hash) VALUES(?,?)').run('race@example.com','x').lastInsertRowid;
      const identity = { issuer:'https://review.cloudflareaccess.com', subject:'synthetic-subject' };
      const links = createLinkService(db);
      links.enroll(userId,identity,['planner_read']);
      const config = { enabled:true, writesEnabled:false, publicUrl:'https://mcp.example.com/mcp', allowedOrigins:[], mcpAudience:'mcp' };
      let request;
      const body = JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{}});
      const verifyAssertion = async () => {
        setImmediate(() => { links.revoke(userId); request.end(body.slice(1)); });
        return identity;
      };
      const app = express();
      app.use('/mcp',createMcpRouter({config,db,links,verifyAssertion,lists:createListService(db)}));
      const listener = app.listen(0,'127.0.0.1',() => {
        request = http.request({host:'127.0.0.1',port:listener.address().port,path:'/mcp',method:'POST',
          headers:{Host:'mcp.example.com','Content-Type':'application/json','Content-Length':Buffer.byteLength(body),Accept:'application/json, text/event-stream'}}, response => {
          response.resume();
          response.on('end',() => { listener.close(); db.close(); process.exit(response.statusCode >= 400 ? 0 : 44); });
        });
        request.on('error',() => process.exit(45));
        request.write(body.slice(0,1));
      });
    `;
    const child = spawnSync(process.execPath, ['-e', script], {
      cwd: path.join(__dirname, '..'), timeout: 5000, encoding: 'utf8',
      env: { ...process.env, DATABASE_PATH: path.join(directory, 'planner.db'), LOG_LEVEL: 'error' },
    });
    assert.equal(child.status, 0, `Protocol request must fail safely; child exit ${child.status}: ${child.stdout} ${child.stderr}`);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
