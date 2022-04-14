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
    const tickerEntities = await strapi.entityService.findMany(uid); //?
    for (const tickerEntity of tickerEntities) {
        await strapi.entityService.delete(uid, tickerEntity.id);
    }
}

module.exports = {
    findOrCreate,
    deleteAllEntites,
};
