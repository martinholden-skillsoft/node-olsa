const moment = require('moment');

var config = module.exports = {};

//Indicates a name for the configuration
config.customer = 'none';
config.startTimestamp = moment().utc().format('YYYYMMDD_HHmmss');


//DEBUG Options - Enables the check for Fiddler, if running the traffic is routed thru Fiddler
config.debug = {};
//Check for fiddler
config.debug.checkFiddler = false;
//Fiddler IP address
config.debug.fiddlerAddress = '127.0.0.1';
//Fiddler Port
config.debug.fiddlerPort = '8888';
//Debug logging
//One of the supported default logging levels for winston - see https://github.com/winstonjs/winston#logging-levels
config.debug.loggingLevel = 'info';
config.debug.logFile = `app_${config.startTimestamp}.log`;

//Concurrency
//Maximum number of images to download at a time
config.maxImageDownloads = 6;
//Maximum number of zips at a time
config.maxZips = 6;

//Site
config.site = {};
//Base URI to OLSA API
config.site.endpoint = null;
//Customer Id
config.site.customerid = null;
//Secret
config.site.sharedsecret = null;

//Inputs
config.inputs = {};
//CSV file containing the assetids
config.inputs.fileName = 'assets.csv';
//Format for the AI metadata
config.inputs.metadataFormat = 'AICC';

//Thumbnail retrieval and storage
config.thumbnails = {};
//Download thumbnails
config.thumbnails.enabled = true;
//Folder to cache thumbnails in - thumbnails are saved with a filename based on the SHA256 hash of the URL used to download it.
config.thumbnails.cachefolder = '../thumbnails';
//Always download thumbnails and do not use cache
config.thumbnails.forceDownload = false;

//Output
config.downloads = {};
//Path to save downloaded data
config.downloads.path = '../results/output';
//File stub
config.downloads.fileNameStub = 'aimetatadata';

//Output
config.output = {};
//Path to save transformed data
config.output.path = '../results/output';
//File name for the transformed metadata
config.output.fileName = 'output.csv';
//File name for the transformed metadata if ZIPPED
config.output.zipfileName = 'output.zip';
//ZIP the transformed metadata and thumbnail images if used.
config.output.zip = true;
//Number of files to include in each chunk
config.output.chunkSize = 100;

//Formatting options for the flat file exported using papaparse
//See https://github.com/mholt/PapaParse
config.output.options = {};
config.output.options.quotes = true;
config.output.options.quoteChar = "\"";
config.output.options.escapeChar = "\"";
config.output.options.delimiter = ",";
config.output.options.header = true;
config.output.options.newline = "\r\n";


//Global Web Retry Options for promise retry
//see https://github.com/IndigoUnited/node-promise-retry#readme
//options is a JS object that can contain any of the following keys:
//retries: The maximum amount of times to retry the operation.Default is 10. Seting this to 1 means do it once, then retry it once.
//factor: The exponential factor to use.Default is 2.
//minTimeout: The number of milliseconds before starting the first retry.Default is 1000.
//maxTimeout: The maximum number of milliseconds between two retries.Default is Infinity.
//randomize: Randomizes the timeouts by multiplying with a factor between 1 to 2. Default is false.
config.retry_options = {};
config.retry_options.retries = 2;
config.retry_options.minTimeout = 1 * 1000;
config.retry_options.maxTimeout = 2 * 1000;

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