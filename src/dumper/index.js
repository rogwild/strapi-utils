const axios = require('axios');
const R = require('ramda');
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
    const pathToSeed = path.join(apiPath, `/${modelName}/content-types/${modelName}/seed.json`);
    const seed = await fs.readFile(pathToSeed, 'utf8').catch((error) => {
        // console.log(`🚀 ~ seed ~ error`, error);
    });

    if (!seed) {
        return;
    }

    const uid = `api::${modelName}.${modelName}`;
    const populate = getDeepPopulate(uid);

    const entites = await strapi.entityService.findMany(uid, {
        populate,
    });

    const json = JSON.stringify(entites, null, 4);

    await fs.writeFile(pathToSeed, json).catch((error) => {
        console.log('🚀 ~ modelDumper ~ error', error);
    });

    console.log('🚀 ~ modelDumper ~ new seed created', pathToSeed);
}

module.exports = dumper;
