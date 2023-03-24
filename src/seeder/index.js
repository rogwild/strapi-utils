const fs = require('fs/promises');
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

module.exports = seeder;
