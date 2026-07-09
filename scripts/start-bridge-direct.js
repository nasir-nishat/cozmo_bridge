const config = require('../ecosystem.config.js');

const app = config.apps.find((candidate) => candidate.name === 'cozmo-bridge');
if (!app) {
  throw new Error('cozmo-bridge app not found in ecosystem.config.js');
}

Object.assign(process.env, app.env);
process.chdir(app.cwd);
require('ts-node/register');
require('../src/index.ts');
