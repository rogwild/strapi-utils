const server = require('./src/server');
const getAllTests = require('./src/helpers/get-all-tests');
const utils = require('./src/helpers/utils');

module.exports = {
    ...server,
    getAllTests,
    utils,
};
