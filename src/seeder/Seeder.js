const axios = require('axios');
const R = require('ramda');
const fs = require('fs/promises');
const path = require('path');

class Seeder {
    constructor({ modelName, apiPath }) {
        this.modelName = modelName;
        this.apiPath = apiPath;
    }

    async setSeed() {
        const pathToSeed = path.join(
            this.apiPath,
            `/${this.modelName}/content-types/${this.modelName}/seed.json`
        );
        const seed = await fs.readFile(pathToSeed, 'utf8').catch((error) => {
            // console.log(`🚀 ~ seed ~ error`, error);
        });

        this.seed = JSON.parse(seed);
    }

    async setSchema() {
        const pathToSchema = path.join(
            this.apiPath,
            `/${this.modelName}/content-types/${this.modelName}/schema.json`
        ); //?
        const schema = await fs.readFile(pathToSchema, 'utf8').catch((error) => {
            // console.log(`🚀 ~ seed ~ error`, error);
        }); //?

        this.schema = JSON.parse(schema);
    }

    async seedEntites() {
        this.seed; //?
        if (!this.seed) {
            return;
        }

        if (Array.isArray(this.seed)) {
            for (const seedItem of this.seed) {
                const entity = new Entity({
                    seed: seedItem,
                    schema: this.schema,
                    modelName: this.modelName,
                    apiPath: this.apiPath,
                });
                await entity.create();
            }
        } else if (typeof this.seed === 'object') {
            const entity = new Entity({
                seed: this.seed,
                schema: this.schema,
                modelName: this.modelName,
                apiPath: this.apiPath,
            });
            await entity.create();
        }
    }
}

class Entity {
    constructor({ seed, schema, modelName, apiPath }) {
        this.seed = seed; //?
        this.schema = schema; //?
        this.entity = {};
        this.modelName = modelName;
        this.apiPath = apiPath;
    }

    async prepare() {
        for (const seedKey of Object.keys(this.seed)) {
            seedKey; //?
            const parameter = new Parameter({
                schema: this.schema,
                key: seedKey,
                seedValue: this.seed[seedKey],
                modelName: this.modelName,
                apiPath: this.apiPath,
            });
            await parameter.prpare();

            if (parameter.value) {
                this.entity[seedKey] = parameter.value;
            }
        }
    }

    async create() {
        await this.prepare();
        this.entity; //?
    }
}

class Parameter {
    constructor({ schema, key, seedValue, modelName, apiPath }) {
        this.schema = schema;
        this.key = key;
        this.seedValue = seedValue;
        this.toSkip = ['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy'];
        this.modelName = modelName;
        this.apiPath = apiPath;
    }

    setAttributes() {
        this.attributes = this.schema.attributes[this.key]; //?
    }

    setType() {
        this.setAttributes();
        this.type = this.attributes?.type;
    }

    setValue(value) {
        value; //?
        if (
            this.attributes?.multiple === true ||
            ['manyToMany'].includes(this.attributes?.relation) ||
            this.type === 'dynamiczone' ||
            this.attributes?.repeatable === true
        ) {
            if (!this.value) {
                this.value = [];
            }

            this.value.push(value);
        } else {
            this.value = value; //?
        }
    }

    async prpare() {
        this.setType();

        this.key; //?
        this.type; //?

        if (this.toSkip.includes(this.key)) {
            return;
        }

        if (this.key === 'publishedAt' && this.seedValue !== null) {
            return new Date().getTime();
        }

        this.key; //?
        this.type; //?
        this.attributes; //?

        if (this.type === 'media') {
            await this.downloadFile(this.seedValue);
        } else if (this.type === 'relation') {
            this.seedValue; //?
        } else if (this.type === 'dynamiczone' || this.type === 'component') {
            const componentsContent = await this.seedComponents(); //?
            this.setValue(componentsContent);
        } else {
            this.setValue(this.seedValue);
        }
    }

    async seedComponents() {
        for (const dzSeedValue of this.seedValue) {
            this.apiPath; //?
            this.seedValue; //?
            this.attributes; //?
            dzSeedValue; //?
            let componentPath;

            if (dzSeedValue?.__component) {
                componentPath = dzSeedValue.__component.replace('.', '/'); //?
            } else if (this.attributes?.component) {
                componentPath = this.attributes.component.replace('.', '/'); //?
            } else {
                return;
            }

            const pathToSchema = path.join(this.apiPath, `../components/${componentPath}.json`); //?
            const schema = await fs.readFile(pathToSchema, 'utf8').catch((error) => {
                // console.log(`🚀 ~ seed ~ error`, error);
            }); //?

            this.seedValue; //?

            const entity = new Entity({
                seed: dzSeedValue,
                schema: JSON.parse(schema),
                modelName: this.modelName,
                apiPath: this.apiPath,
            }); //?

            await entity.prepare();

            return entity.entity;
        }
    }

    async downloadFile(value) {
        this.seedValue; //?

        if (!value) {
            return;
        }

        if (Array.isArray(value)) {
            for (const fileValue of value) {
                await this.downloadFile(fileValue);
            }
        } else {
            let additionalAttributes = {};
            if (value?.headers) {
                if (Object.keys(value.headers)?.length) {
                    additionalAttributes['headers'] = { ...value.headers };
                }
            }

            const file = await axios({
                method: 'GET',
                url: value.url,
                responseType: 'arraybuffer',
                ...additionalAttributes,
            }).then(function (response) {
                return response.data;
            });

            const fileMeta = {
                name: value.name.toLowerCase(),
                type: value.mime,
                size: Buffer.byteLength(file),
                buffer: file,
            };

            this.setValue(1);
            return;

            const createdFile = await strapi
                .plugin('upload')
                .service('upload')
                .upload({
                    files: fileMeta,
                    data: {},
                })
                .then((res) => res[0]);

            this.value = createdFile?.id;
        }
    }
}

module.exports = Seeder;
