'use strict';

module.exports = {
    bootstrap: require('./bootstrap'),
    controllers: {
        auth: require('./controllers/auth'),
        user: require('./controllers/user'),
    },
    services: {
        user: require('./services/user'),
    },
    utils: require('./utils'),
};
