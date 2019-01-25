var config = require('./config.global');

config.customer = 'default';

//DEBUG Options - Enables the check for Fiddler, if running the traffic is routed thru Fiddler
//Check for fiddler
config.debug.checkFiddler = true;

//Debug logging
//One of the supported default logging levels for winston - see https://github.com/winstonjs/winston#logging-levels
config.debug.loggingLevel = 'debug';
config.debug.logFile = `${config.customer}_${config.startTimestamp}.log`;

//Site
config.site.endpoint = process.env.endpoint || null;
config.site.customerid = process.env.customerid || null;
config.site.sharedsecret = process.env.sharedsecret || null;

//Path to save downloaded data
config.downloads.path = `../results//${config.customer}_ExampleOutput${config.startTimestamp}`;
//File stub
config.downloads.fileNameStub = `${config.customer}_aimetatadata${config.startTimestamp}`;

//Output
config.output.path = `../results/${config.customer}_ExampleOutput${config.startTimestamp}`;
config.output.fileName = `${config.customer}_ExampleOutput${config.startTimestamp}.txt`;
config.output.zipfileName = `${config.customer}_ExampleOutput${config.startTimestamp}.zip`;
config.output.zip = true;

//Polling options for retrying OLSA requests
//see https://github.com/IndigoUnited/node-promise-retry#readme
//options is a JS object that can contain any of the following keys:
//retries: The maximum amount of times to retry the operation.Default is 10. Seting this to 1 means do it once, then retry it once.
//factor: The exponential factor to use.Default is 2.
//minTimeout: The number of milliseconds before starting the first retry.Default is 1000.
//maxTimeout: The maximum number of milliseconds between two retries.Default is Infinity.
//randomize: Randomizes the timeouts by multiplying with a factor between 1 to 2. Default is false.

config.polling_options = {};
config.polling_options.retries = 10;
config.polling_options.minTimeout = 60 * 1000;
config.polling_options.maxTimeout = 120 * 1000;

module.exports = config;