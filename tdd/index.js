const server = require('./src/server');
const getAllTests = require('./src/helpers/get-all-tests');
const utils = require('./src/helpers/utils');
const websocket = require('./src/helpers/websocket');

module.exports = {
    ...server,
    ...websocket,
    getAllTests,
    utils,
};
