const _ = require('lodash');
const path = require('path');
const appPackageJson = require(path.join(process.cwd(), 'package.json'));

// Configs
const server = require('./server.js');
const logger = require('./logger.js');
const db = require('./db.js');
const api = require('./api.js');
const client = require('./client.js');
const i18n = require('./i18n.js');
const passport = require('./passport.js');
const mailer = require('./mailer.js');
const sockets = require('./sockets.js');

// Default environment value, it can be set in local.js or passed as process.env.NODE_ENV
let env = 'development';

//Get default configs
let config = {
  debug: false,
  server,
  api,
  logger,
  db,
  client,
  i18n,
  passport,
  mailer,
  sockets,
};

let local;
let envConfigPath;
let mainConfig = require(path.join(process.cwd(), config.server.configPath, 'index.js'));

try {
  local = require(path.join(process.cwd(), config.server.configPath, 'local.js'));
} catch (e) {
  //TODO for now do not throw an error, as in some environments it might not use local.js
  local = {};
  console.error(e); // eslint-disable-line no-console
  console.error("Make sure to copy 'SAMPLE.local.js' file and rename it to 'local.js' inside 'config' folder"); // eslint-disable-line no-console, quotes
  // throw new Error("Make sure you copied 'SAMPLE.local.js' file and renamed it to 'local.js' inside 'config' folder");
}

// Set env from mainConfig, if there is one
if (mainConfig.environment) {
  env = mainConfig.environment;
}

// Override env from local, if there is one
if (local.environment) {
  env = local.environment;
}

// Override env from process.env.NODE_ENV if passed
if (process.env.NODE_ENV) {
  env = process.env.NODE_ENV;
} else {
  process.env.NODE_ENV = env;
}

// Selected Environment
console.info('Selected Environment:', env); // eslint-disable-line no-console

// Merge this config with mainConfig
_.merge(config, mainConfig);

envConfigPath = path.join(process.cwd(), config.server.configPath, `/environment/${env}.js`);
try {
  // Merge Environment Specific Configuration
  _.merge(config, require(envConfigPath));
} catch (e) {
  //TODO for now do not throw an error
  console.error(`Environment config file not found: '${envConfigPath}'`); // eslint-disable-line no-console
  // throw new Error(`Environment config file not found: './environment/${env}.js'`);
}

// Override if there is anything from local.js
_.merge(config, local);

//Set version from package.json
config.version = appPackageJson.version;

// We need to set it last, if just in case it was passed as process.env.NODE_ENV
config.environment = env;

module.exports = config;
