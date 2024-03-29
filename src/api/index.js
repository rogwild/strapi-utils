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
const getDeepPopulate = require('./get-deep-populate');
const createDocumentFromTemplate = require('./create-document-from-template');

module.exports = {
    setPermissions,
    sanitizeDataForClone,
    assignFilterKeys,
    deleteAllEntites,
    removeEmptyIds,
    parseBody,
    customizeCoreStrapi,
    getDeepPopulate,
    createDocumentFromTemplate,
    ...transformers,
    ...lifecycleActions,
    ...middlewares,
};
