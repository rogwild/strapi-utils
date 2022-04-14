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

exports = {};
