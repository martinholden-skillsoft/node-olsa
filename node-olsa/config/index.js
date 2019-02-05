const { LoggerFactory } = require('../util/logger.js');

var customer = process.env.CUSTOMER || 'default';

var configFile = 'config.' + customer;
var configPath = './' + configFile;

//console.log("+++++++++++++++++++++++++++++++++++++++++");
//console.log("++ Loading Configuration               ++");
//console.log(`++++ config - Loading Config Overrides from ./config/${configFile}`);



cfg = require(configPath);
const configLogger = new LoggerFactory(cfg);
configLogger.info('config', `Loaded Config Overrides from ./config/${configFile}`);


//console.log("-- Loading Configuration Completed     --");
//console.log("-----------------------------------------");
module.exports = cfg;