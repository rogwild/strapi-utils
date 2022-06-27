const sanitizeDataForClone = ({ data, keysForIds = [] }) => {
    data;
    const sanitized = {};
    for (const entry of Object.entries(data)) {
        entry;
        if (entry[0] !== 'id') {
            entry[0];
            if (typeof entry[1] === 'object' && entry[1] !== null) {
                entry[0];
                if (keysForIds.includes(entry[0])) {
                    if(Array.isArray(entry[1])) {
                        sanitized[entry[0]] = [];
                        for (const entryItem of entry[1]) {
                            entryItem;
                            sanitized[entry[0]].push(entryItem.id);
                        }
                        continue;
                    } else {
                        sanitized[entry[0]] = entry[1].id;
                        continue;
                    }
                }
                if (Array.isArray(entry[1])) {
                    entry[1];
                    sanitized[entry[0]] = [];
                    for (const entryItem of entry[1]) {
                        entryItem;
                        sanitized[entry[0]].push(sanitizeDataForClone({ data: entryItem, keysForIds }));
                    }
                } else {
                    sanitized[entry[0]] = sanitizeDataForClone({ data: entry[1] });
                }
            } else {
                sanitized[entry[0]] = entry[1];
            }
        }
    }
    return sanitized;
};

function assignFilterKeys({ schema, config, data }) {
    const filters = {};
    const attributes = schema.attributes;
    schema; //?
    config; //?
    data; //?

    for (const configKey of Object.keys(config)) {
        configKey; //?
        if (attributes[configKey]) {
            attributes[configKey]; //?
            filters[configKey] = data[config[configKey]];
        }
    }

    filters; //?

    return filters;
}

/**
 *
 * @param {object} params - strapi service params (data, populate) and special config
 * Example config:
 * {
 *   title: 'alias'
 *   |      |-- form passed data object
 *   |-- model param from schema
 * }
 * @param {strign} uid - strapi model name 'api::ticker.ticker'
 * @param {object} schema - strapi model schema
 * @returns {object} created entity
 *
 * @usage
 * const schema = require('../content-types/ticker/schema.json');
 * const uid = 'api::ticker.ticker';
 *
 * ...
 *      const data = {
 *          anotherServiceAlias: 'usd'
 *      };
 *      const config = {
 *          alias: 'anotherServiceAlias'
 *      }
 *      await findOrCreate({data, config}, { uid, schema });
 */
async function findOrCreate(params, { uid, schema }) {
    const populate = params.populate; //?

    const filters = assignFilterKeys({
        schema,
        config: params.config,
        data: params.data,
    }); //?
    const data = params.data;

    const entities = await strapi.entityService.findMany(uid, {
        populate,
        filters,
    }); //?
    let entity = entities.length ? entities[0] : undefined; //?
    if (!entity) {
        entity = await strapi.entityService.create(uid, { populate, data });
    }

    entity; //?
    return entity;
}

async function deleteAllEntites(uid) {
    const entites = await strapi.entityService.findMany(uid); //?
    if (typeof entites === 'object') {
        if (Array.isArray(entites)) {
            for (const entity of entites) {
                await strapi.entityService.delete(uid, entity.id);
            }
        } else {
            await strapi.entityService.delete(uid, entites.id);
        }
    }
}

/* ./config/permissions.js
 * module.exports = ({ env }) => ({
 *     authenticated: {
 *         role: 1,
 *         actions: {
 *             'plugin::content-type-builder.components': [],
 *             'plugin::content-type-builder.content-types': [],
 *             'plugin::email.email': [],
 *             'plugin::upload.content-api': [],
 *             'plugin::i18n.locales': [],
 *             'plugin::users-permissions.auth': ['connect'],
 *             'plugin::users-permissions.user': ['me', 'update'],
 *             'plugin::users-permissions.role': [],
 *             'plugin::users-permissions.permission': [],
 *         },
 *     },
 *     public: {
 *         role: 2,
 *         actions: {
 *             'plugin::content-type-builder.components': [],
 *             'plugin::content-type-builder.content-types': [],
 *             'plugin::email.email': [],
 *             'plugin::upload.content-api': [],
 *             'plugin::i18n.locales': [],
 *             'plugin::users-permissions.auth': ['connect', 'callback'],
 *             'plugin::users-permissions.user': ['me'],
 *             'plugin::users-permissions.role': [],
 *             'plugin::users-permissions.permissiosn': [],
 *         },
 *     },
 * });
 */
const setPermissions = async () => {
    const queryKey = 'plugin::users-permissions.permission';

    const currentPermissions = await strapi.query(queryKey).findMany();

    const configPermissions = strapi.config.get('permissions');

    const toDelete = currentPermissions.map(({ action }) => action);

    console.log('currentPermissions', toDelete.length);
    const toCreate = Object.values(configPermissions).flatMap(({ role, actions }) =>
        Object.entries(actions)
            .filter(([key, arr]) => arr.length)
            .flatMap(([key, arr]) => arr.flatMap((val) => ({ action: `${key}.${val}`, role })))
    );

    for (const item of toDelete) {
        await strapi.query(queryKey).delete({ where: { action: item } });
    }

    for (const item of toCreate) {
        await strapi.query(queryKey).create({ data: item });
    }

    const updatedPermissions = await strapi.query(queryKey).findMany();

    console.log('updated', updatedPermissions.length);
};

module.exports = {
    sanitizeDataForClone,
    findOrCreate,
    deleteAllEntites,
    setPermissions,
};

const removeEmptyIds = (data) => {
    let modified;
    if (Array.isArray(data)) {
        modified = [...data];
    } else {
        modified = { ...data };
    }

    if (Array.isArray(modified)) {
        modified = modified.map((item) => removeEmptyIds(item));
    } else {
        for (const key in modified) {
            if (key === 'id' && ['', null, undefined].indexOf(modified[key]) > -1) {
                delete modified[key];
            }
            if (Array.isArray(modified[key])) {
                modified[key] = modified[key].map((item) => removeEmptyIds(item));
            }
        }
    }

    console.log(`🚀 ~ removeEmptyIds ~ data`, data);
    return modified;
};
