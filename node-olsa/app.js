const globalTunnel = require('global-tunnel-ng');
const olsaclient = require('./olsaclient');
const _ = require('lodash');
const promiseRetry = require('promise-retry');
const fs = require('fs');
const papa = require('papaparse');
const archiver = require('archiver');
const stat = require('fs').statSync;
const sharp = require("sharp");
const SHA256 = require("crypto-js/sha256");
const TaskQueue = require('cwait').TaskQueue;
const axios = require('axios');

const AdmZip = require('adm-zip');

const { createLogger, format, transports } = require('winston');
const { combine, timestamp, label, printf, colorize } = format;

var configOptions = require('./config');

//Check to see if the default Fidder Port 8888 is reachable if so route traffic thru Fiddler on 127.0.0.1
//Using this for debugging
const checkFiddler = async (fiddlerProxy, fiddlerPort) => {
    //logInfo('checkFiddler', 'Start checkFiddler');
    var fiddlerEchoPage = `http://${fiddlerProxy}:${fiddlerPort}`;
    logDebug('checkFiddler', `Checking if Fiddler is Running on ${fiddlerEchoPage}`);
    try {
        const response = await axios({
            method: 'GET',
            url: fiddlerEchoPage,
            timeout: 1000
        });
        if (/Fiddler Echo Service/.test(response.data || '')) {
            logDebug('checkFiddler', `Fiddler is running on ${fiddlerEchoPage}`);
            //logInfo('checkFiddler', 'End checkFiddler');
            return true;
        }
    } catch (err) {
        logDebug('checkFiddler', 'Fiddler is not running');
        //logInfo('checkFiddler', 'End checkFiddler');
        return false;
    }

};

//Utilities
const makeOutputFolder = (fullPath) => {
    //logInfo('makeOutputFolder','Start makeOutputFolder');
    logInfo('makeOutputFolder', `Path: ${fullPath}`);
    var path = fullPath.replace(/\/$/, '').split('/');
    for (var i = 1; i <= path.length; i++) {
        var segment = path.slice(0, i).join('/');
        !fs.existsSync(segment) ? fs.mkdirSync(segment) : null;
    }
    //logInfo('makeOutputFolder','End makeOutputFolder');
};

var unzip = function (zipFile, output, overwrite, keepfolders) {

    overwrite = typeof overwrite !== 'undefined' ? overwrite : true;
    keepfolders = typeof keepfolders !== 'undefined' ? keepfolders : true;
    
    return new Promise(function (resolve, reject) {
        try {
            logInfo('unzip', `Unzipping: ${zipFile} to ${output}. Overwrite Files: ${overwrite} Keep Folder Structure: ${keepfolders}`);
            var zip = new AdmZip(zipFile);
            var zipEntries = zip.getEntries(); // an array of ZipEntry records
            logDebug('unzip', `Total files to extract: ${zip.getEntries().length}`);

            
            if (keepfolders) {
                zip.extractAllTo(output, overwrite);
            } else {
                zipEntries.forEach(function (zipEntry) {
                    zip.extractEntryTo(zipEntry, output, false, overwrite);
                });
            }

            resolve(output);
        } catch (err) {
            logError('unzip', `ERROR: unzipping file : ${zipFile} : ${err}`);
            reject(err);
        }
    });
};

var zip = function (zipFile, sourceFolder, fileNames) {
    return new Promise(function (resolve, reject) {
        try {
            logInfo('zip', `Creating : ${zipFile}`);
            var zip = new AdmZip();


            _.forEach(fileNames, (fileName) => {
                const p = stat(`${sourceFolder}/${fileName}`);
                if (p.isFile()) {
                    zip.addLocalFile(`${sourceFolder}/${fileName}`);
                }
            });

            zip.writeZip(zipFile);
            resolve(zipFile);
        } catch (err) {
            logError('zip', `ERROR: zipping file : ${zipFile} : ${err}`);
            reject(err);
        }
    });
};

const downloadFile = async (url, options) => promiseRetry(async (retry, numberOfRetries) => {
    if (_.isNull(options.downloads.path)) {
        logError('downloadFile', 'ERROR: Argument check failed: downloads.path is invalid');
        throw new Error('downloadFile - ERROR: Argument check failed: downloads.path is invalid');
    }

    const ext = url.split('.').pop();

    var localFilename = null;
    if (_.isNull(options.downloads.fileNameStub)) {
        localFilename = SHA256(url.trim().toLowerCase()).toString() + '.' + ext;
    } else {
        localFilename = options.downloads.fileNameStub + '.' + ext;
    }

    const localFileFullName = `${options.downloads.path}/${localFilename}`;
    const writer = fs.createWriteStream(localFileFullName);

    try {
        const response = await axios({
            method: 'GET',
            url: url,
            responseType: 'stream'
        });

        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            response.data.on('end', () => {
                logDebug('downloadFile', 'Downloaded file');
                //resolve(localFileFullName);
            });

            response.data.on('error', (err) => {
                logError('downloadFile', `ERROR: downloading file : ${url} : ${err}`);
                //reject(err);
            });

            writer.on('finish', () => {
                logDebug('downloadFile', `Downloaded file closed. File: ${localFileFullName}`);
                resolve(localFileFullName);
            }
            );
            writer.on('error', (err) => {
                logError('downloadFile', `ERROR: writing file : ${localFileFullName} : ${err}`);
                reject(err);
            });


        });

    } catch (err) {

        if (numberOfRetries < options.retry_options.retries + 1) {
            retry(err);
        } else {
            logError('downloadFile', `ERROR: DONE Trying to get file: ${url}`);
        }
    }

}, options.retry_options);

//OLSA AI Request
const SubmitAI = async (client, assetids, format, options) => promiseRetry(async (retry, numberOfRetries) => {

    try {
        logInfo('SubmitAI', `Requesting items: ${JSON.stringify(assetids)}`);
        var result = await client.AI_GetMultipleAssetMetaData(assetids, format);
        return result;
    } catch (err) {
        logInfo('SubmitAI', `Got Error after Attempt# ${numberOfRetries} : ${err}`);
        if (numberOfRetries < options.retry_options.retries + 1) {
            retry(err);
        } else {
            logError('SubmitAI', 'ERROR: DONE Trying to get items');
        }
        throw err;
    }

}, options.retry_options);

const PollAI = async (client, handle, options) => promiseRetry(async (retry, numberOfRetries) => {

    try {
        logInfo('PollAI', `Polling for results: ${handle}`);
        var result = await client.AI_PollForAssetMetaData(handle);

        return result;
    } catch (err) {
        logInfo('PollAI', `Got Error after Attempt# ${numberOfRetries} : ${err}. Waiting ${options.polling_options.minTimeout} ms`);
        if (numberOfRetries < options.polling_options.retries + 1) {

            retry(err);
        } else {
            logError('PollAI', 'ERROR: DONE Trying to get items');
        }
        throw err;
    }

}, options.polling_options);


const main = async (options, assetIds, metadataFormat) => {
    logInfo('main', 'Start');

    logDebug('main', `Options: ${JSON.stringify(options)}`);

    options = options || null;

    if (options.debug.checkFiddler) {
        logInfo('main', 'Checking if Fiddler is running');
        var result = await checkFiddler(options.debug.fiddlerAddress, options.debug.fiddlerPort);
        if (result) {
            logInfo('main', 'Setting Proxy Configuration so requests are sent via Fiddler');

            process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;

            globalTunnel.initialize({
                host: options.debug.fiddlerAddress,
                port: options.debug.fiddlerPort
            });
        }
    } else {
        //Use the process.env.http_proxy and https_proxy
        globalTunnel.initialize();
    }

    if (_.isNull(options)) {
        logError('main', 'Invalid configuration make sure to set env CUSTOMER');
        return false;
    }

    if (_.isNull(options.site.endpoint)) {
        logError('main', 'Invalid configuration - no endpoint in config file or set env endpoint');
        return false;
    }

    if (_.isNull(options.site.customerid)) {
        logError('main', 'Invalid configuration - no customerid or set env customerid');
        return false;
    }

    if (_.isNull(options.site.sharedsecret)) {
        logError('main', 'Invalid configuration - no sharedsecret or set env sharedsecret');
        return false;
    }

    //Create thumbnail folder if one is defined and does not exist
    if (!_.isNull(options.thumbnails.cachefolder)) {
        if (!fs.existsSync(options.thumbnails.cachefolder)) {
            makeOutputFolder(options.thumbnails.cachefolder);
        }
    }

    //Create output folder if one does not exist
    if (!_.isNull(options.output.path)) {
        if (!fs.existsSync(options.output.path)) {
            makeOutputFolder(options.output.path);
        }
    }

    //Create downloads folder if one does not exist
    if (!_.isNull(options.downloads.path)) {
        if (!fs.existsSync(options.downloads.path)) {
            makeOutputFolder(options.downloads.path);
        }
    }

    var client = new olsaclient.OlsaClient({ hostname: options.site.endpoint, customerid: options.site.customerid, sharedsecret: options.site.sharedsecret });

    var responseHandle = await SubmitAI(client, assetIds, metadataFormat, options);
    logInfo('main', `Result : ${JSON.stringify(responseHandle)}`);
    var download = await PollAI(client, responseHandle.handle, options);
    logInfo('main', `Download : ${JSON.stringify(download)}`);

    var localFile = await downloadFile(download.olsaURL, options);

    var unzipped = await unzip(localFile, options.downloads.path, true, false);

    var localZipFileFullName = `${options.output.path}/testing.zip`;
    var testZipping = fs.readdirSync(options.output.path);

    //lets try zipping
     var zipped = await zip(localZipFileFullName, options.output.path, testZipping);


};

//Setup Winston Logging
const myFormat = printf(info => {
    return `${info.timestamp} [${info.label}] ${info.level}: ${info.message}`;
});

const loggerTransports = {
    console: new transports.Console({ level: configOptions.debug.loggingLevel }),
    file: new transports.File({ filename: configOptions.debug.logFile, level: configOptions.debug.loggingLevel, options: { flags: 'w' } })
};

const logger = createLogger({
    format: combine(
        timestamp(),
        myFormat
    ),
    transports: [
        loggerTransports.console,
        loggerTransports.file
    ]
});

const logInfo = (label, message) => {
    logger.log(
        {
            level: 'info',
            message: message,
            label: label
        }
    );
};

const logError = (label, message) => {
    logger.log(
        {
            level: 'error',
            message: message,
            label: label
        }
    );
};

const logDebug = (label, message) => {
    logger.log(
        {
            level: 'debug',
            message: message,
            label: label
        }
    );
};

const logVerbose = (label, message) => {
    logger.log(
        {
            level: 'verbose',
            message: message,
            label: label
        }
    );
};

main(configOptions, ['75381', '68413', '99060', '50227', '71618', '99673', '44513', '39608', '39476', '39368', '39493', '39511', '39517', '39613', '39721', '39463', '39817', '39403', '39409', '39415', '39421', '39373', '39433', '39457', '39625', '39469', '39349', '39637', '39487', '46731', '138148', '42970', '74334', '20203', '43776', '37866', '49187', '42744', '54171', '45347', '45348', '43770', '102574', '49190', '59037', '42746', '37861', '43774', '49189', '37860', '37867', '44157', '45731', '43614', '37863', '43773', '44159', '45352', '49184', '49185', '49186', '90894', '59038', '37857', '16772', '136470', '136466', '136471', '136468', '136473', '136467', '136469', '136472', '136464', '136463', '136465', '36514', '7202', '12506', '24383', '46427', '35237', '5934', '6682', '115820', '25214', '4169', '7517', '7518', '4789', '3794', '3922', '4968', '8184', '66689', '5542', '6910', '6361', '8495', '59012', '2711', '36047', '7299', '5935', '8185', '50811', '5505', '3225', '46066', '833', '4743', '37627', '130289', '74341', '37443', '37619', '42311', '37623', '30224', '28277', '30225', '42158', '37384', '30223', '30238', '74322', '33121', '56035', '39764', '39620', '123263', '58116', '33132', '19031', '46866', '135522', '73937', '46428', '4107', '12743', '23496', '5176', '45644', '129722', '24493', '135280', '42791', '132906', '31150', '33613', '27571', '29852', '26914', '133107', '22654', '33070', '35125', '26572', '33072', '37578', '29950', '40521', '101420', '23070', '128444', '31042', '128445', '135257', '125331', '16602', '58401', '65732', '34385', '38009', '133087', '34386', '52620', '34387', '38010', '16603', '95382', '34391', '59172', '45311', '74336', '35051', '35094', '128004', '12917', '20709', '9034', '24767', '48963', '128574', '127942', '133295', '5746', '48965', '128575', '128187', '81554', '128183', '104119', '25250', '25994', '36349', '70007', '7840', '7841', '8919', '1689', '2486', '133247', '133256', '1938', '133246', '30546', '8686', '8685', '28418', '135262', '135259', '12460', '105446', '56223', '10351', '10353', '10352', '46305', '10354', '43646', '10355', '82367', '36894', '63426', '49529', '2668', '135636', '34150', '35713', '16119', '10295', '10294', '10293', '41368', '133105', '1921', '30539', '129737', '115227', '20589', '112607', '66330', '18036', '128346', '12713', '36698', '14920', '9470', '31731', '22522', '20706', '32827', '13248', '128391', '135532', '56945', '50635', '50563', '50636', '30051', '13250', '129727', '56485', '12181', '43022', '46887', '44260', '51431', '42604', '20690', '135488', '51513', '31149', '120049', '18863', '120172', '135491', '30665', '12096', '128446', '128417', '135534', '119870', '128418', '21633', '21631', '133098', '16510', '12110', '128184', '27068', '14244', '12109', '14243', '133134', '27069', '16522', '6573', '128448', '135536', '135535', '130319', '9188', '128192', '68830', '32306', '32307', '32308', '128449', '128419', '128450', '128420', '40329', '40328', '42809', '11971', '27811', '135555', '128421', '42725', '42728', '33133', '19032', '6164', '14529', '48943', '33509', '12825', '12826', '12827', '11397', '135492', '44963', '46996', '16529', '18505', '14220', '14218', '22502', '25043', '26135', '28721', '22949', '30888', '32968', '10873', '38025', '47690', '56444', '69623', '104373', '12490', '44163', '34220', '135584', '128422', '56001', '50165', '43836', '43837', '33628', '51875', '8037', '135556', '128423', '128424', '59145', '19460', '12829', '25075', '134854', '12830', '20590', '12828', '43562', '37661', '10356', '128425', '10395', '128191', '44813', '128358', '43125', '39912', '76846', '46867', '33134', '19033', '33019', '19339', '121148', '121113', '43730', '36098', '6544', '6546', '6545', '19340', '20591', '22120', '128452', '128453', '31504', '31505', '11834', '119935', '44088', '2463', '78972', '4514', '46044', '139232', '8955', '76750', '46045', '43152', '41056', '13521', '32660', '8920', '35746', '4149', '41203', '32030', '44688', '7851', '63520', '135290', '137819', '58117', '125661', '127980', '137820', '93053', '97509', '56041', '51680', '36906', '51090', '76561', '23426', '25165', '40556', '40557', '43151', '105461', '8327', '8295', '10428', '8328', '10427', '18082', '23445', '9855', '32174', '25359', '8118', '13017', '5125', '5122', '52635', '39831', '42943', '33166', '42969', '135526', '33135', '19034', '16084', '24836', '5328', '44156', '47068', '63194', '45349', '57166', '37856', '54169', '56101', '45353', '37868', '37858', '44155', '47066', '37870', '97532', '41836', '14830', '33736'], 'AICC');

