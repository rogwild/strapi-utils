const axios = require('axios');
const R = require('ramda');
const fs = require('fs/promises');
const path = require('path');

class Seeder {
    constructor({ modelName, apiPath, seededModelNames, skipModels }) {
        this.modelName = modelName;
        this.apiPath = apiPath;
        this.seededModelNames = seededModelNames;
        this.skipModels = skipModels;
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
            this.seededModelNames.push(this.modelName);
            return;
        }

        if (Array.isArray(this.seed)) {
            for (const seedItem of this.seed) {
                const entity = new Entity({
                    seed: seedItem,
                    schema: this.schema,
                    seeder: this,
                });
                await entity.create();
            }
        } else if (typeof this.seed === 'object') {
            const entity = new Entity({
                seed: this.seed,
                schema: this.schema,
                seeder: this,
            });
            await entity.create();
        }

        this.seededModelNames.push(this.modelName);
    }
}

class Entity {
    constructor({ seed, schema, seeder }) {
        this.seed = seed; //?
        this.schema = schema; //?
        this.data = {};
        this.seeder = seeder;
    }

    async prepare() {
        for (const seedKey of Object.keys(this.seed)) {
            seedKey; //?
            const parameter = new Parameter({
                schema: this.schema,
                key: seedKey,
                seedValue: this.seed[seedKey],
                entity: this,
            });
            await parameter.prpare();

            if (parameter.value) {
                this.data[seedKey] = parameter.value;
            }
        }
    }

    async create() {
        await this.prepare();
        this.data; //?
        this.seeder.seededModelNames; //?
        if (this.data) {
            console.log('🚀 ~ create ~ this.data:', this.seeder.modelName);
            try {
                const createdEntity = await strapi.entityService.create(
                    `api::${this.seeder.modelName}.${this.seeder.modelName}`,
                    {
                        data: this.data,
                    }
                );

                console.log('🚀 ~ create ~ createdEntity:', createdEntity);
            } catch (error) {
                console.log('🚀 ~ Entity ~ create ~ error.message:', error.message);
            }
        }
    }
}

class Parameter {
    constructor({ schema, key, seedValue, entity }) {
        this.schema = schema;
        this.key = key;
        this.seedValue = seedValue;
        this.toSkip = ['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy'];
        this.entity = entity;
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

        this.key; //?
        this.type; //?
        this.attributes; //?

        if (this.type === 'media') {
            await this.downloadFile(this.seedValue);
        } else if (this.type === 'relation') {
            await this.seedRelations();
        } else if (this.type === 'dynamiczone' || this.type === 'component') {
            const componentsContent = await this.seedComponents(); //?
            this.setValue(componentsContent);
        } else if (this.type === 'uid') {
            // generate unique uid
            this.setValue(`${this.seedValue}-${Math.floor(Math.random() * 10e10)}`);
        } else {
            this.setValue(this.seedValue);
        }
    }

    async seedRelations() {
        this.key; //?
        this.type; //?
        this.attributes; //?
        this.seedValue; //?
        const tergetModelName = this.attributes.target.replace('api::', '').split('.')[0]; //?

        const alsoSeededModels = this.entity.seeder.seededModelNames.filter(
            (modelName) => modelName === tergetModelName
        ); //?
        if (alsoSeededModels?.length > 0 || this.entity.seeder?.skipModels?.includes(tergetModelName)) {
            return;
        }

        const seed = new Seeder({
            modelName: tergetModelName,
            apiPath: this.entity.seeder.apiPath,
            seededModelNames: this.entity.seeder.seededModelNames,
            skipModels: [...(this.entity.seeder?.skipModels || []), this.entity.seeder.modelName],
        });
        await seed.setSchema();
        await seed.setSeed();
        await seed.seedEntites();

        if (!this.seedValue) {
            return;
        }

        if (Array.isArray(this.seedValue)) {
            if (!this.seedValue?.length) {
                return;
            }

            for (const relationSeedValue of this.seedValue) {
                const filters = {};

                for (const relationSeedValueKey of Object.keys(relationSeedValue)) {
                    relationSeedValueKey; //?
                    if (this.toSkip.includes(relationSeedValueKey)) {
                        continue;
                    }

                    if (typeof relationSeedValue[relationSeedValueKey] === 'string') {
                        filters[relationSeedValueKey] = relationSeedValue[relationSeedValueKey];
                    }
                }
                filters; //?
                const [relationEntity] = await strapi.entityService.findMany(this.attributes.target, {
                    filters,
                });

                if (relationEntity) {
                    this.setValue(relationEntity);
                }
            }
        } else {
            const filters = {};
            for (const relationSeedValueKey of Object.keys(this.seedValue)) {
                relationSeedValueKey; //?
                if (this.toSkip.includes(relationSeedValueKey)) {
                    continue;
                }

                if (typeof this.seedValue[relationSeedValueKey] === 'string') {
                    filters[relationSeedValueKey] = this.seedValue[relationSeedValueKey];
                }
            }

            filters; //?
        }

        this.entity.seeder.modelName; //?
    }

    async seedComponents() {
        for (const dzSeedValue of this.seedValue) {
            this.entity.seeder.apiPath; //?
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

            const pathToSchema = path.join(this.entity.seeder.apiPath, `../components/${componentPath}.json`); //?
            const schema = await fs.readFile(pathToSchema, 'utf8').catch((error) => {
                // console.log(`🚀 ~ seed ~ error`, error);
            }); //?

            this.seedValue; //?

            const entity = new Entity({
                seed: dzSeedValue,
                schema: JSON.parse(schema),
                seeder: this.entity.seeder,
            }); //?

            await entity.prepare();

            return entity.data;
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

            const createdFile = await strapi
                .plugin('upload')
                .service('upload')
                .upload({
                    files: fileMeta,
                    data: {},
                })
                .then((res) => res[0]);

            this.setValue(createdFile);
        }
    }
}

module.exports = Seeder;
