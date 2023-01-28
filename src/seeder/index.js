const axios = require('axios');
const R = require('ramda');
const fs = require('fs/promises');
const path = require('path');

/**
 * API Models seeder
 *
 * Add seed.json to /content-types/<model>, function gets all api models and their
 * seed files (/content-types/<model>/seed.json) and creates
 * entites if model is empty.
 *
 * @param {string} apiPath - path.join(__dirname, './api') if you call that function from bootstrap.js
 */
async function seeder(apiPath) {
    const apiDirs = await fs.readdir(apiPath);

    if (apiDirs.length) {
        for (const modelName of apiDirs) {
            await modelSeeder({ apiPath, modelName });
        }
    }
}

async function modelSeeder({ apiPath, modelName, callerName }) {
    const pathToSeed = path.join(apiPath, `/${modelName}/content-types/${modelName}/seed.json`);
    const seed = await fs.readFile(pathToSeed, 'utf8').catch((error) => {
        // console.log(`🚀 ~ seed ~ error`, error);
    });

    const pathToSchema = path.join(apiPath, `/${modelName}/content-types/${modelName}/schema.json`);
    const schema = await fs.readFile(pathToSchema, 'utf8').catch((error) => {
        // console.log(`🚀 ~ seed ~ error`, error);
    });

    if (!seed || !schema) {
        return;
    }

    console.log('🚀 ~ modelSeeder ~ seeding', modelName);

    const seedAsJson = JSON.parse(seed);
    const schemaAsJson = JSON.parse(schema);

    const modelEntities = await strapi.entityService.findMany(`api::${modelName}.${modelName}`, {
        populate: {
            favicon: '*',
        },
    });

    if (!modelEntities || modelEntities?.length === 0) {
        if (Array.isArray(seedAsJson)) {
            for (const seedItem of seedAsJson) {
                const modified = await findFilesInSeedData({
                    data: seedItem,
                    schema: schemaAsJson,
                    apiPath,
                    callerName,
                });

                await strapi.entityService.create(`api::${modelName}.${modelName}`, {
                    data: modified,
                });
            }
        } else {
            const modified = await findFilesInSeedData({
                data: seedAsJson,
                schema: schemaAsJson,
                apiPath,
                callerName,
            });

            await strapi.entityService.create(`api::${modelName}.${modelName}`, {
                data: modified,
            });
        }
    }
}

async function findFilesInSeedData({ data, path = '', schema, apiPath, callerName }) {
    if (data && typeof data === 'object') {
        if (Array.isArray(data)) {
            let resData = [...data];

            for (const [index, entry] of data.entries()) {
                const entryPath = `${path}[${index}]`;
                const resEntry = await findFilesInSeedData({ data: entry, path: entryPath, schema, apiPath });

                resData = R.modifyPath([index], () => resEntry, resData);
            }

            return resData;
        } else {
            if (data.mime) {
                try {
                    const file = await axios({
                        method: 'get',
                        url: data.url,
                        responseType: 'arraybuffer',
                    }).then(function (response) {
                        return response.data;
                    });

                    const fileMeta = {
                        name: data.name,
                        type: data.mime,
                        size: Buffer.byteLength(file),
                        buffer: file,
                    };

                    const createdFile = await strapi
                        .plugin('upload')
                        .service('upload')
                        .upload({
                            files: fileMeta,
                            data: {},
                        })
                        .then((res) => res[0]);

                    return createdFile;
                } catch (error) {
                    console.log('fetching image error', data.url);
                    return;
                }
            }

            let resData = { ...data };

            for (const dataKey of Object.keys(data)) {
                const currentModelNames = [schema.info.singularName, schema.info.pluralName];
                const attributeType = schema.attributes[dataKey]?.type;

                if (['id'].includes(dataKey)) {
                    continue;
                } else if (['createdBy', 'updatedBy'].includes(dataKey)) {
                    resData = {
                        ...resData,
                        [dataKey]: data[dataKey]?.id || null,
                    };

                    continue;
                } else if (dataKey === 'publishedAt' && data[dataKey] && data[dataKey] !== '') {
                    resData = {
                        ...resData,
                        [dataKey]: new Date(),
                    };

                    continue;
                } else if (attributeType === 'relation') {
                    const relationModel = schema.attributes[dataKey].target;

                    const relationModelName = relationModel.split('::')[1].split('.')[0];

                    let filters;

                    if (Array.isArray(data[dataKey])) {
                        if (data[dataKey].length) {
                            filters = {
                                $or: [],
                            };

                            for (const relationEntity of data[dataKey]) {
                                if (relationEntity) {
                                    const passF = fillFilters(relationEntity);

                                    filters['$or'].push(passF);
                                }
                            }
                        }
                    } else if (data[dataKey]) {
                        filters = {};
                        for (const key of Object.keys(data[dataKey])) {
                            if (
                                ![
                                    'id',
                                    'createdAt',
                                    'publishedAt',
                                    'updatedBy',
                                    'updatedAt',
                                    'publishedAt',
                                ].includes(key) &&
                                data[dataKey][key]
                            ) {
                                filters[key] = data[dataKey][key];
                            }
                        }
                    }

                    // console.log('🚀 ~ findFilesInSeedData ~ filters', relationModel, filters);

                    let entities;
                    if (filters) {
                        entities = await strapi.entityService.findMany(relationModel, {
                            filters,
                        });
                    }

                    if (entities !== undefined && filters) {
                        if (
                            !schema.attributes[dataKey]?.mappedBy ||
                            currentModelNames.includes(schema.attributes[dataKey]?.mappedBy)
                        ) {
                            /**
                             * For stopping cycle creation after first iteration
                             */
                            if (relationModelName && relationModelName !== callerName) {
                                await modelSeeder({
                                    apiPath,
                                    modelName: relationModelName,
                                    callerName: schema.info.singularName,
                                });
                            }
                        }

                        entities = await strapi.entityService.findMany(relationModel, {
                            filters,
                        });
                    }

                    if (entities) {
                        if (entities.length === 1) {
                            resData = {
                                ...resData,
                                [dataKey]: entities[0].id,
                            };
                        } else {
                            resData = {
                                ...resData,
                                [dataKey]: entities.map((entity) => entity.id),
                            };
                        }
                    } else {
                        resData = {
                            ...resData,
                            [dataKey]: undefined,
                        };
                    }

                    continue;
                }

                const passResults = await findFilesInSeedData({
                    data: data[dataKey],
                    path: `${path}${dataKey}`,
                    schema,
                    apiPath,
                });
                const filteredResults = Array.isArray(passResults)
                    ? passResults.filter((res) => res !== undefined)
                    : passResults;

                resData = {
                    ...resData,
                    [dataKey]: filteredResults,
                };
            }

            return resData;
        }
    } else {
        return data;
    }
}

module.exports = seeder;

function fillFilters(obj) {
    const filters = {};

    for (const key of Object.keys(obj)) {
        if (
            !['id', 'createdAt', 'publishedAt', 'updatedBy', 'updatedAt', 'publishedAt'].includes(key) &&
            obj[key]
        ) {
            filters[key] = obj[key];
        }
    }

    return filters;
}
