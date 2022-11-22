const setPermissions = require('./set-permissions');
const sanitizeDataForClone = require('./sanitize-data-for-clone');
const assignFilterKeys = require('./assign-filter-keys');
const deleteAllEntites = require('./delete-all-enitites');
const removeEmptyIds = require('./remove-empty-ids');
const transformers = require('./transformers');
const parseBody = require('./parse-body');
const customizeCoreStrapi = require('./customize-core-strapi');
const lifecycleActions = require('./lifecycle-actions');
const middlewares = require('./middlewares');
const mfa = require('./mfa');

module.exports = {
    setPermissions,
    sanitizeDataForClone,
    assignFilterKeys,
    deleteAllEntites,
    removeEmptyIds,
    parseBody,
    customizeCoreStrapi,
    ...transformers,
    ...lifecycleActions,
    ...middlewares,
    mfa,
};
