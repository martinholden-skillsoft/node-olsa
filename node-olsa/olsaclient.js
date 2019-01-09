var soap = require('soap');
var _ = require('lodash');

var OlsaClient = function (options) {
    this._initializeOptions(options);
};

OlsaClient.prototype._initializeOptions = function (options) {
    this.hostname = options.hostname;
    this.wsdl = `https://${options.hostname}/olsa/services/Olsa?WSDL`;
    this.customerid = options.customerid;
    this.sharedsecret = options.sharedsecret;

    this.wsse = new soap.WSSecurity(this.customerid, this.sharedsecret, {
        hasNonce: true,
        passwordType: 'PasswordDigest',
        hasTimeStamp: true,
        hasTokenCreated: true,
        mustUnderstand: false,
        actor: ''
    });

};

OlsaClient.prototype.AI_GetMultipleAssetMetaData = function (assetIds, format) {
    var self = this;

    var p = new Promise(function (resolve, reject) {
        localClient = new soap.createClient(self.wsdl, function (err, client) {
            if (err) {
                reject(err);
            } else {

                var args = {
                    customerId: self.customerid,
                    assetId: _.isArray(assetIds) ? assetIds.join(',') : assetIds,
                    metadataFormat: format
                };

                client.setSecurity(self.wsse);

                client.AI_GetMultipleAssetMetaData(args, function (err, result, rawResponse, soapHeader, rawRequest) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(result);
                    }
                });
            }
        });
    });
    return p;
};

OlsaClient.prototype.SL_FederatedSearch = function (phrase, username, languagecode) {
    var self = this;

    var p = new Promise(function (resolve, reject) {
        localClient = new soap.createClient(self.wsdl, function (err, client) {
            if (err) {
                reject(err);
            } else {
                var args = {
                    customerId: self.customerid,
                    searchPhrase: phrase,
                    languageCode: languagecode,
                    userName: username
                };

                client.setSecurity(self.wsse);

                client.SL_FederatedSearch(args, function (err, result, rawResponse, soapHeader, rawRequest) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(result);
                    }
                });
            }
        });
    });
    return p;
};

exports.OlsaClient = OlsaClient;
