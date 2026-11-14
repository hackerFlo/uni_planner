// An "agent actor" is anything that acts through the agent surface rather than
// the website UI: the MCP server ('mcp') and the shared agent sub-account that
// signs in through the normal login form ('agent'). Both set task activity
// markers and neither ever clears them -- only a 'web' actor does.
const AGENT_ACTORS = Object.freeze(['mcp', 'agent']);

const isAgentActor = actor => AGENT_ACTORS.includes(actor);

// requireAuth sets req.principal; a request that somehow lacks it is treated as
// the owner's website session, which is the pre-agent-account behaviour.
const actorOf = req => (req.principal?.kind === 'agent' ? 'agent' : 'web');

const requestContext = req => ({ userId: req.user.id, actor: actorOf(req) });

module.exports = { isAgentActor, actorOf, requestContext };
