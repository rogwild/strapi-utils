const axios = require('axios');
const R = require('ramda');
const fs = require('fs/promises');
const path = require('path');
const Seeder = require('./Seeder');

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
        const seededModelNames = [];
        const seededModels = {};

        for (const modelName of apiDirs) {
            try {
                const seed = new Seeder({
                    modelName,
                    apiPath,
                    seededModelNames,
                    seededModels,
                });
                await seed.setSchema();
                await seed.setSeed();
                await seed.seedEntites();
            } catch (error) {
                console.log('🚀 ~ seeder ~ error', modelName, error?.message);
            }
        }
    }
}

async function modelSeeder({ apiPath, modelName, callerName, passedSeed, seededEntities }) {
    const pathToSeed = path.join(apiPath, `/${modelName}/content-types/${modelName}/seed.json`);
    const seed = await fs.readFile(pathToSeed, 'utf8').catch((error) => {
        // console.log(`🚀 ~ seed ~ error`, error);
    });

    const pathToSchema = path.join(apiPath, `/${modelName}/content-types/${modelName}/schema.json`);
    const schema = await fs.readFile(pathToSchema, 'utf8').catch((error) => {
        // console.log(`🚀 ~ seed ~ error`, error);
    });

    const seedModels = process.env.SEED_MODELS || '*';
    if (!seedModels) {
        return;
    }

    if (seedModels !== '*') {
        const seedModelsArray = seedModels.split(',');
        if (!seedModelsArray.includes(modelName)) {
            return;
        }
    }

    if (!seed || !schema || seed === null) {
        return;
    }

    if (seededEntities.includes(modelName)) {
        return;
    }

    console.log('🚀 ~ modelSeeder ~ modelName:', modelName);

    const seedAsJson = passedSeed ? passedSeed : JSON.parse(seed);
    const schemaAsJson = JSON.parse(schema);

    if (Array.isArray(seedAsJson)) {
        const allModified = [];

        for (const seedItem of seedAsJson) {
            const modified = await findFilesInSeedData({
                data: seedItem,
                schema: schemaAsJson,
                apiPath,
                callerName,
                seededEntities,
            });

            allModified.push(modified);
            await createOrUpdateEntity({ modified, modelName });
        }

        const allEntites = await strapi.entityService.findMany(`api::${modelName}.${modelName}`, {
            limit: -1,
        });

        if (process.env.IF_NO_ENTITY_IN_SEED) {
            const compareBy = process.env.COMPARE_BY;

            if (!compareBy) {
                console.log('Add process.env.COMPARE_BY for checking model existing');
            } else {
                for (const entity of allEntites) {
                    const compareKeys = process.env.COMPARE_BY.split(',');
                    let compareKey;

                    for (const key of compareKeys) {
                        if (entity[key]) {
                            compareKey = key;
                            break;
                        }
                    }

                    let existsInJson = false;

                    if (!compareKey) {
                        console.log(
                            `Add key to process.env.COMPARE_BY for checking ${modelName} model existing. Skip deleting.`
                        );

                        existsInJson = true;
                    } else {
                        for (const allModifiedEntity of allModified) {
                            if (entity[compareKey] === allModifiedEntity[compareKey]) {
                                existsInJson = true;
                            }
                        }
                    }

                    if (!existsInJson) {
                        const method = process.env.IF_NO_ENTITY_IN_SEED;
                        console.log('🚀 ~ modelSeeder ~ entity not exist in JSON', entity);

                        if (method === 'delete') {
                            await strapi.entityService.delete(`api::${modelName}.${modelName}`, entity.id);
                        }
                    }
                }
            }
        }
    } else {
        const modified = await findFilesInSeedData({
            data: seedAsJson,
            schema: schemaAsJson,
            apiPath,
            callerName,
            seededEntities,
        });

        await createOrUpdateEntity({ modified, modelName });
    }

    seededEntities.push(modelName);
}

async function createOrUpdateEntity({ modified, modelName }) {
    const filters = {};
    const compareKeys = process.env.COMPARE_BY.split(',');

    for (const key of compareKeys) {
        if (modified[key]) {
            filters[key] = modified[key];
            break;
        }
    }

    let currentEntity;

    if (Object.keys(filters).length) {
        try {
            const existingEntites = await strapi.entityService.findMany(`api::${modelName}.${modelName}`, {
                filters,
            });
            if (Array.isArray(existingEntites)) {
                currentEntity = existingEntites[0];
            } else {
                currentEntity = existingEntites;
            }
        } catch (error) {
            console.log('🚀 ~ createOrUpdateEntity ~ error:', error);
        }
    }

    if (currentEntity) {
        await strapi.entityService.update(`api::${modelName}.${modelName}`, currentEntity.id, {
            data: modified,
        });
    } else {
        const created = await strapi.entityService.create(`api::${modelName}.${modelName}`, {
            data: modified,
        });
    }
}

async function findFilesInSeedData({ data, itemPath = '', schema, apiPath, callerName, seededEntities }) {
    if (data && typeof data === 'object') {
        if (Array.isArray(data)) {
            let resData = [...data];

            for (const [index, entry] of data.entries()) {
                const entryPath = `${itemPath}[${index}]`;
                const resEntry = await findFilesInSeedData({
                    data: entry,
                    itemPath: entryPath,
                    schema,
                    apiPath,
                    seededEntities,
                });

                resData = R.modifyPath([index], () => resEntry, resData);
            }

            return resData;
        } else {
            if (data.mime) {
                try {
                    let additionalAttributes = {};
                    if (data?.headers) {
                        if (Object.keys(data.headers)?.length) {
                            additionalAttributes['headers'] = { ...data.headers };
                        }
                    }

                    const file = await axios({
                        method: 'GET',
                        url: data.url,
                        responseType: 'arraybuffer',
                        ...additionalAttributes,
                    }).then(function (response) {
                        return response.data;
                    });

                    const fileMeta = {
                        name: data.name.toLowerCase(),
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

            let resData = {};

            for (const dataKey of Object.keys(data)) {
                const currentModelNames = [schema.info.singularName, schema.info.pluralName];
                const attributeType = schema.attributes[dataKey]?.type;

                if (['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy'].includes(dataKey)) {
                    continue;
                } else if (['createdBy', 'updatedBy'].includes(dataKey)) {
                    resData = {
                        ...resData,
                        [dataKey]: null,
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
                                    'updatedAt',
                                    'publishedAt',
                                    'createdBy',
                                    'updatedBy',
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
                                    seededEntities,
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
                } else if (dataKey === 'localizations') {
                    if (data[dataKey].length) {
                        // for (const localizedEntity of data[dataKey]) {
                        //     const passedSeed = localizedEntity;
                        //     delete passedSeed.localizations;

                        //     await modelSeeder({
                        //         apiPath,
                        //         modelName: schema.info.singularName,
                        //         passedSeed,
                        //         seededEntities,
                        //     });
                        // }

                        continue;
                    }
                } else if (dataKey === '__component') {
                    const pathToComponentSchema = path.join(
                        apiPath,
                        `../components/${data[dataKey].replace('.', '/')}.json`
                    );
                    const componentSchema = await fs
                        .readFile(pathToComponentSchema, 'utf8')
                        .catch((error) => {
                            // console.log(`🚀 ~ seed ~ error`, error);
                        });

                    const componentSchemaJson = JSON.parse(componentSchema);

                    for (const schemaKey in componentSchemaJson.attributes) {
                        if (componentSchemaJson.attributes[schemaKey].type === 'relation') {
                            const relationModelName = componentSchemaJson.attributes[schemaKey].target
                                .split('::')[1]
                                .split('.')[0];

                            await modelSeeder({
                                apiPath,
                                modelName: relationModelName,
                                callerName: schema.info.singularName,
                                seededEntities,
                            });
                        }
                    }
                }

                const passResults = await findFilesInSeedData({
                    data: data[dataKey],
                    itemPath: `${itemPath}${dataKey}`,
                    schema,
                    apiPath,
                    seededEntities,
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
