const isOwner = require('./is-owner');
const passJwtUserAsFilter = require('./pass-jwt-user-as-filter');
const passJwtUserToBody = require('./pass-jwt-user-to-body');

module.exports = {
    isOwner,
    passJwtUserAsFilter,
    passJwtUserToBody,
};
