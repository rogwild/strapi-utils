const { merge } = require('lodash/fp');

function getDeepPopulate(uid, populate) {
    if (populate) {
        return populate;
    }

    const { attributes } = strapi.getModel(uid);

    return Object.keys(attributes).reduce((populateAcc, attributeName) => {
        const attribute = attributes[attributeName];

        if (attribute.type === 'relation') {
            populateAcc[attributeName] = true; // Only populate first level of relations
        }

        if (attribute.type === 'component') {
            populateAcc[attributeName] = {
                populate: getDeepPopulate(attribute.component, null),
            };
        }

        if (attribute.type === 'media') {
            populateAcc[attributeName] = { populate: 'folder' };
        }

        if (attribute.type === 'dynamiczone') {
            populateAcc[attributeName] = {
                populate: (attribute.components || []).reduce((acc, componentUID) => {
                    return merge(acc, getDeepPopulate(componentUID, null));
                }, {}),
            };
        }

        return populateAcc;
    }, {});
}

module.exports = getDeepPopulate;
