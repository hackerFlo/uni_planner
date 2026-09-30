const cookieParser = require('cookie-parser');
const { createAccessVerifier } = require('./access');
const { createLinkService } = require('./links');
const { createListService } = require('../services/lists');
const { createMcpRouter, hostBoundary } = require('./router');
const { createAgentConnectionsRouter } = require('../routes/agentConnections');

// Mount before the website's generic JSON parser so both isolated surfaces
// authenticate before parsing and retain their own body limits.
function mountMcp(app, config, db, { verifyAssertion = createAccessVerifier(config) } = {}) {
  const links = createLinkService(db);
  const lists = createListService(db);
  const readVersion = context => db.prepare('SELECT epoch,revision FROM planner_versions WHERE user_id=?').get(context.userId);
  const options = { config, db, links, lists, verifyAssertion, readVersion };
  app.use(hostBoundary(config));
  app.use('/mcp', createMcpRouter(options));
  app.use('/api/agent-connections', cookieParser(), createAgentConnectionsRouter(options));
}

module.exports = { mountMcp };
