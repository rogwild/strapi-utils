const fs = require('fs/promises');
const path = require('path');
const getDeepPopulate = require('../api/get-deep-populate');

/**
 * API Models seeder
 *
 * Add seed.json to /content-types/<model>, function gets all api models and their
 * seed files (/content-types/<model>/seed.json) and creates
 * entites if model is empty.
 *
 * @param {string} apiPath - path.join(__dirname, './api') if you call that function from bootstrap.js
 */
async function dumper(apiPath) {
    const apiDirs = await fs.readdir(apiPath);

    if (apiDirs.length) {
        for (const modelName of apiDirs) {
            await modelDumper(apiPath, modelName);
        }
    }
}

async function modelDumper(apiPath, modelName) {
    const pathToSeed = path.join(apiPath, `/${modelName}/content-types/${modelName}/seeds`);

    try {
        await fs.stat(pathToSeed);
    } catch (error) {
        return;
    }

    let oldSeedFiles = await fs.readdir(pathToSeed);

    for (const oldSeedFile of oldSeedFiles) {
        if (oldSeedFile === '.gitkeep') {
            continue;
        }

        await fs.unlink(path.join(`${pathToSeed}/${oldSeedFile}`));
    }

    const uid = `api::${modelName}.${modelName}`;
    const populate = getDeepPopulate(uid);

    if (populate.localizations) {
        populate.localizations = {
            populate: {
                ...populate,
            },
        };
    }

    const entites = await strapi.entityService.findMany(uid, {
        populate,
    });

    if (Array.isArray(entites)) {
        for (const entity of entites) {
            const json = JSON.stringify(entity, null, 4);
            const fileName = `${pathToSeed}/${entity.id}.json`;

            await fs.writeFile(`${pathToSeed}/${entity.id}.json`, json).catch((error) => {
                console.log('🚀 ~ modelDumper ~ error', error);
            });

            console.log('🚀 ~ modelDumper ~ new seed created', fileName);
        }
    } else if (entites && typeof entites === 'object') {
        const json = JSON.stringify(entites, null, 4);
        const fileName = `${pathToSeed}/${entites.id}.json`;

        await fs.writeFile(fileName, json).catch((error) => {
            console.log('🚀 ~ modelDumper ~ error', error);
        });

        console.log('🚀 ~ modelDumper ~ new seed created', fileName);
    }
}

module.exports = dumper;
