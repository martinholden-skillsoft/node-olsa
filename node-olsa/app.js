const globalTunnel = require('global-tunnel-ng');
const olsaclient = require('./olsaclient');
const _ = require('lodash');
const got = require('got');

const constants = require('./config');


//Check to see if the default Fidder Port 8888 is reachable if so route traffic thru Fiddler on 127.0.0.1
//Using this for debugging
const checkFiddler = async (fiddlerProxy, fiddlerPort) => {
    var fiddlerEchoPage = `http://${fiddlerProxy}:${fiddlerPort}`;
    console.log(`Checking if Fiddler is Running on ${fiddlerEchoPage}`);
    try {
        const response = await got(fiddlerEchoPage, {timeout: 500});
        if (/Fiddler Echo Service/.test(response.body || '')) {
            console.log(`Fiddler is running on ${fiddlerEchoPage}`);
            return true;
        }
    } catch (err) {
        console.log("Fiddler is not running");
        return false;
    }

};

const main = async () => {
    //For PRODUCTION you would want to remove this
    var result = await checkFiddler(constants.FIDDLERPROXY, constants.FIDDLERPORT);
    if (result) {
        console.log("Setting Proxy Configuration so requests are sent via Fiddler");

        process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;

        globalTunnel.initialize({
            host: constants.FIDDLERPROXY,
            port: constants.FIDDLERPORT
        });
    } else {
        //Use the process.env.http_proxy and https_proxy
        globalTunnel.initialize();
    }

    var client = new olsaclient.OlsaClient({ hostname: constants.OLSAHOST, customerid: constants.OLSAUSER, sharedsecret: constants.OLSASECRET });

    console.log('Calling AI_GetMultipleAssetMetaData');
    client.AI_GetMultipleAssetMetaData('12345','CSVX').then(function (result) {
        console.log('AI_GetMultipleAssetMetaData result :' + JSON.stringify(result, null, 4));
    }).catch(err => console.log('Error ' + err));

    //console.log('Calling SL_FederatedSearch');
    //client.SL_FederatedSearch('cisco', 'olsatest', 'en-us').then(function (result) {
    //    console.log('SL_FederatedSearch result :' + JSON.stringify(result, null, 4));
    //}).catch(err => console.log('Error ' + err));
};

main();

