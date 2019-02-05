const globalTunnel = require('global-tunnel-ng');
const olsaclient = require('./olsaclient');
const _ = require('lodash');
const promiseRetry = require('promise-retry');
const fs = require('fs');
const Path = require('path');
const papa = require('papaparse');
const stat = require('fs').statSync;
const sharp = require("sharp");
const SHA256 = require("crypto-js/sha256");
const TaskQueue = require('cwait').TaskQueue;
const axios = require('axios');

const AdmZip = require('adm-zip');

const { LoggerFactory } = require('./util/logger.js');

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

const unzip = (zipFile, output, overwrite, keepfolders, useFileNameForFolder, inputFormat) => {
    overwrite = typeof overwrite !== 'undefined' ? overwrite : true;
    keepfolders = typeof keepfolders !== 'undefined' ? keepfolders : true;
    useFileNameForFolder = typeof useFileNameForFolder !== 'undefined' ? useFileNameForFolder : false;

    //We are extracting files to a folder using the ZIP filename
    if (useFileNameForFolder) {
        var fileNameNoExt = Path.basename(zipFile, '.zip');
        output = Path.join(output, fileNameNoExt);
        if (!fs.existsSync(output)) {
            makeOutputFolder(output);
        }
    }

    return new Promise(function (resolve, reject) {

        var response = {};
        response.format = inputFormat;
        response.path = output;
        response.fileList = [];

        try {
            logInfo('unzip', `Unzipping: ${zipFile} to ${output}. Overwrite Files: ${overwrite} Keep Folder Structure: ${keepfolders} UseFileNameForFolder: ${useFileNameForFolder}`);
            var zip = new AdmZip(zipFile);
            var zipEntries = zip.getEntries(); // an array of ZipEntry records
            logDebug('unzip', `Total files to extract: ${zip.getEntries().length}`);

            zipEntries.forEach(function (zipEntry) {
                zip.extractEntryTo(zipEntry, output, keepfolders, overwrite);
                response.fileList.push(keepfolders ? zipEntry.entryName : Path.basename(zipEntry.entryName));
            });


            resolve(response);
        } catch (err) {
            logError('unzip', `ERROR: unzipping file : ${zipFile} : ${err}`);
            reject(err);
        }
    });
};

const zip = (zipFile, fileNames) => {
    return new Promise(function (resolve, reject) {
        try {
            logInfo('zip', `Creating : ${zipFile}`);
            var zip = new AdmZip();


            _.forEach(fileNames, (fileName) => {
                const p = stat(fileName);
                if (p.isFile()) {
                    zip.addLocalFile(fileName);
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

const getCatalogFromCSV = (csvFile) => {
    let csvContent = fs.readFileSync(csvFile, 'utf8');
    return new Promise((resolve, reject) => {
        papa.parse(csvContent, {
            header: true,
            skipEmptyLines: true,
            delimiter: ',',
            complete: (results) => {
                resolve(results.data);
            },
            error: (err) => {
                reject(err);
            }
        });
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

    const localFileFullName = Path.join(options.downloads.path, localFilename);
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
const AI_GetMultipleAssetMetaData = async (client, assetids, options, metadataFormat) => promiseRetry(async (retry, numberOfRetries) => {

    var metaFormat = metadataFormat || options.inputs.metadataFormat;

    try {
        logInfo('SubmitAI', `Requesting items: ${JSON.stringify(assetids)}`);
        var result = await client.AI_GetMultipleAssetMetaData(assetids, metaFormat);
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

const AI_PollForAssetMetaData = async (client, handle, options) => promiseRetry(async (retry, numberOfRetries) => {

    try {
        logInfo('PollAI', `Polling for results: ${handle}`);
        var result = await client.AI_PollForAssetMetaData(handle);

        return result;
    } catch (err) {
        logInfo('PollAI', `Got Error after Attempt# ${numberOfRetries} : ${err}.`);
        if (numberOfRetries < options.polling_options.retries + 1) {

            retry(err);
        } else {
            logError('PollAI', 'ERROR: DONE Trying to get items');
        }
        throw err;
    }

}, options.polling_options);

const getAssetIdsFromCSV = async (options) => {
    return new Promise(function (resolve, reject) {
        try {
            logInfo('getAssetIdsFromCSV', `Loading : ${options.inputs.fileName}`);
            var result = [];

            fs.readFile(options.inputs.fileName, 'utf8', function (err, data) {
                if (err) {
                    reject(err);
                } else {
                    result = data.split(/[\r\n]+/);
                    resolve(result);
                }
            });

        } catch (err) {
            logError('getAssetIdsFromCSV', `ERROR: ${err}`);
            reject(err);
        }
    });
};

const downloadMetadataFromOlsa = async (client, assetIds, format, options) => {
    format = format.toUpperCase();
    return AI_GetMultipleAssetMetaData(client, assetIds, options, format)
        .then((responseHandle) => {
            logInfo('main', `Result ${format} : ${JSON.stringify(responseHandle)}`);
            return AI_PollForAssetMetaData(client, responseHandle.handle, options);
        })
        .then((downloadUrl) => {
            logInfo('main', `Download ${format}: ${JSON.stringify(downloadUrl)}`);
            return downloadFile(downloadUrl.olsaURL, options);
        })
        .then((downloadFile) => {
            logInfo('main', `Download ${format} Saved : ${downloadFile}`);
            return unzip(downloadFile, options.downloads.path, true, false, true, format);
        });
};

const downloadImage = async (thumbnailItem, options) => promiseRetry(async (retry, numberOfRetries) => {

    if (_.isNull(options.thumbnails.cachefolder)) {
        logError('downloadImage', 'ERROR: Argument check failed: thumbnailcache is invalid');
        throw new Error('downloadImage - ERROR: Argument check failed: thumbnailcache is invalid');
    }

    const url = thumbnailItem.source;
    var localImageFile = thumbnailItem.local;

    const cachedFile = Path.join(options.thumbnails.cachefolder, localImageFile);

    if (!options.thumbnails.forceDownload) {
        if (fs.existsSync(cachedFile) && fs.statSync(cachedFile).size > 0) {
            logDebug('downloadImage', `Using cached image. File: ${cachedFile}`);
            thumbnailItem.filesource = cachedFile;
            return Promise.resolve(thumbnailItem);
        }
    }

    try {
        const response = await axios({
            method: 'GET',
            url: url,
            responseType: 'stream'
        });

        response.data.pipe(fs.createWriteStream(cachedFile));

        return new Promise((resolve, reject) => {
            response.data.on('end', () => {
                logDebug('downloadImage', `Downloaded image and cached. File: ${cachedFile}`);
                thumbnailItem.filesource = cachedFile;
                resolve(thumbnailItem);
            });

            response.data.on('error', (err) => {
                logError('downloadImage', `ERROR: trying to write image : ${thumbnailItem.local} : ${err}`);
                reject(err);
            });
        });

    } catch (err) {

        if (numberOfRetries < options.retry_options.retries + 1) {
            retry(err);
        } else {
            logError('downloadImage', `ERROR: DONE Trying to get image: ${thumbnailItem.local}`);
        }
    }

}, configOptions.retry_options);

const main = async (options) => {
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

    try {
        var assetIds = await getAssetIdsFromCSV(options);

        var client = new olsaclient.OlsaClient({ hostname: options.site.endpoint, customerid: options.site.customerid, sharedsecret: options.site.sharedsecret });

        var results = await Promise.all([
            downloadMetadataFromOlsa(client, assetIds, 'AICC', options),
            downloadMetadataFromOlsa(client, assetIds, 'CSVX', options)
        ]);

        //Long form           
        //var csvxResults = results.filter(obj => {
        //    return obj.format === 'CSVX';
        //}).pop();

        var aiccResults = results[0];
        var csvxResults = results[1];

        var csvxCatalogFile = _.chain(csvxResults.fileList)
            .filter(
                function (item) {
                    return _.startsWith(item.toLowerCase(), 'customer_catalog');
                })
            .first()
            .value();

        var csvxData = await getCatalogFromCSV(Path.join(csvxResults.path, csvxCatalogFile));

        var thumbNailList = csvxData.map(function (asset) {
            if (!_.isUndefined(asset.imageurl)) {
                var item = {};
                item.source = asset.imageurl;
                item.local = asset.identifier + '.' + asset.imageurl.split('.').pop();
                return item;
            }
        });

        if (!_.isNull(thumbNailList)) {
            logInfo('main', `Starting image download Number of images: ${thumbNailList.length}`);

            var queue = new TaskQueue(Promise, options.maxImageDownloads);
            resultList = await Promise.all(
                thumbNailList.map(queue.wrap(item => downloadImage(item, options)))).catch((err) => {
                    logInfo('main', err.message); // some coding error in handling happened
                });
            logInfo('main','All images downloaded');
        }

        logInfo('main', 'Chunking Data');
        var zipQueue = new TaskQueue(Promise, options.maxZips);
        var zippedList = await Promise.all(
            _.chunk(csvxData, options.output.chunkSize).map(zipQueue.wrap((chunked, index, array) => {
                var files = [];
                _.forEach(chunked, (asset) => {
                    files.push(Path.join(options.thumbnails.cachefolder, asset.identifier + '.' + asset.imageurl.split('.').pop()));
                    files.push(Path.join(aiccResults.path, asset.identifier + '.au'));
                    files.push(Path.join(aiccResults.path, asset.identifier + '.crs'));
                    files.push(Path.join(aiccResults.path, asset.identifier + '.cst'));
                    files.push(Path.join(aiccResults.path, asset.identifier + '.des'));
                    files.push(Path.join(aiccResults.path, asset.identifier + '.ort'));
                });
                var fileName = Path.join(options.output.path, _.padStart(index, 4, '0') + options.output.zipfileName);
                return zip(fileName, files);

            }))).catch((err) => {
                logInfo('main', err.message); // some coding error in handling happened
            });
        logInfo('main', 'All chunks zipped');
    }
    catch (err) {
        logError('main', `ERROR: ${err}`);
    }

};


const myLogger = new LoggerFactory(configOptions);

const logInfo = (label, message) => {
    myLogger.info(label,message);
};

const logError = (label, message) => {
    myLogger.error(label, message);
};

const logDebug = (label, message) => {
    myLogger.debug(label, message);
};

const logVerbose = (label, message) => {
    myLogger.verbose(label, message);
};

main(configOptions);

