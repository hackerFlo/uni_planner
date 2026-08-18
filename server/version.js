// APP_VERSION and APP_COMMIT are baked in at image build time (see Dockerfile
// and .github/workflows/docker-publish.yml). Outside Docker they are unset and
// the package version stands in, so a local run is always labelled "dev".
const pkg = require('./package.json');

const VERSION = process.env.APP_VERSION || pkg.version;
const COMMIT = process.env.APP_COMMIT || 'dev';

module.exports = { VERSION, COMMIT };
