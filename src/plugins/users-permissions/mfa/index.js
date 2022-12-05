'use strict';

module.exports = {
    controllers: {
        auth: require('./controllers/auth'),
        user: require('./controllers/user'),
    },
    services: {
        user: require('./services/user'),
    },
};
