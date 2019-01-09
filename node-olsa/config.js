const config = {
    OLSAHOST: process.env.OLSAHOST || 'aeeval.skillwsa.com',
    OLSAUSER: process.env.OLSAUSER || 'spaeeval',
    OLSASECRET: process.env.OLSASECRET || 'vM3s1hKVMy6zBOn',
    FIDDLERPROXY: process.env.FIDDLERPROXY || '127.0.0.1',
    FIDDLERPORT: process.env.FIDDLERPORT || '8888'
};

module.exports = config;