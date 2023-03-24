const axios = require('axios');
const fs = require('fs/promises');
const path = require('path');

class Seeder {
    constructor({ modelName, apiPath, seededModelNames, skipModels, seededModels }) {
        this.modelName = modelName;
        this.apiPath = apiPath;
        this.seededModelNames = seededModelNames;
        this.skipModels = skipModels;
        this.seededModels = seededModels;
    }

    async setSeed() {
        const pathToSeed = path.join(
            this.apiPath,
            `/${this.modelName}/content-types/${this.modelName}/seed.json`
        );
        const seed = await fs.readFile(pathToSeed, 'utf8').catch((error) => {
            // console.log(`🚀 ~ seed ~ error`, error);
        });

        if (seed) {
            this.seed = JSON.parse(seed);
        }
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
        const createdEntites = [];
        this.seed; //?
        if (!this.seed) {
            this.seededModelNames.push(this.modelName);
            return;
        }

        if (Array.isArray(this.seed)) {
            for (const seedItem of this.seed) {
                if (this.modelName === 'attribute-key') {
                    console.log('🚀 ~ seedEntites ~ this.modelName:', this.modelName);
                }
                const entity = new Entity({
                    seed: seedItem,
                    schema: this.schema,
                    seeder: this,
                });
                const created = await entity.create();

                createdEntites.push({
                    old: seedItem,
                    new: created,
                });
            }
        } else if (typeof this.seed === 'object') {
            const entity = new Entity({
                seed: this.seed,
                schema: this.schema,
                seeder: this,
            });
            const created = await entity.create();
            createdEntites.push({
                old: this.seed,
                new: created,
            });
        }

        createdEntites;
        this.seededModels[this.modelName] = createdEntites;
        this.seededModelNames.push(this.modelName);
        return createdEntites;
    }
}

class Entity {
    constructor({ seed, schema, seeder }) {
        this.seed = seed; //?
        this.schema = schema; //?
        this.data = {};
        this.seeder = seeder;
        this.keysToSkip = ['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy'];
    }

    async prepare() {
        for (const seedKey of Object.keys(this.seed)) {
            seedKey; //?
            if (seedKey === 'attribute') {
                console.log('🚀 ~ prepare ~ seedKey:', seedKey);
            }
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
            console.log('🚀 ~ create ~ this.seeder.modelName:', this.seeder.modelName);

            const filters = setFilters({ entity: this.data, toSkip: this.keysToSkip, seeder: this.seeder });

            console.log('🚀 ~ create ~ filters:', filters);

            if (this.seeder.modelName === 'attribute-key') {
                console.log('🚀 ~ seedRelations ~ targetModelName:', this.seeder.modelName);
            }

            filters; //?
            const existingEntities = await strapi.entityService.findMany(
                `api::${this.seeder.modelName}.${this.seeder.modelName}`,
                {
                    filters,
                }
            );

            if (Array.isArray(existingEntities)) {
                if (existingEntities.length) {
                    return existingEntities[0];
                }
            } else if (existingEntities) {
                return existingEntities;
            }

            try {
                const createdEntity = await strapi.entityService.create(
                    `api::${this.seeder.modelName}.${this.seeder.modelName}`,
                    {
                        data: this.data,
                    }
                );

                return createdEntity;
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
        // console.log('🚀 ~ setValue ~ value:', value);

        if (this.entity.seeder.modelName === 'attribute') {
            console.log('🚀 ~ seedRelations ~ targetModelName:', this.entity.seeder.modelName);
        }

        if (
            this.attributes?.multiple === true ||
            ['manyToMany', 'oneToMany'].includes(this.attributes?.relation) ||
            this.type === 'dynamiczone' ||
            this.attributes?.repeatable === true
        ) {
            if (!this.value) {
                this.value = [];
            }

            if (Array.isArray(value)) {
                for (const val of value) {
                    this.value.push(val);
                }
            } else {
                this.value.push(value);
            }
        } else {
            this.value = value; //?
        }
    }

    async prpare() {
        this.setType();

        this.key; //?
        this.type; //?

        if (this.entity.keysToSkip.includes(this.key)) {
            return;
        }

        this.key; //?
        this.type; //?
        this.attributes; //?

        if (this.type === 'media') {
            await this.downloadFile(this.seedValue);
            return;
        } else if (this.type === 'relation') {
            await this.seedRelations();
            return;
        } else if (this.key === 'localizations') {
            const localizationsContent = await this.seedLocalizations(); //?
            this.setValue(localizationsContent);
            return;
        } else if (this.type === 'dynamiczone' || this.type === 'component') {
            const componentsContent = await this.seedComponents(); //?
            this.setValue(componentsContent);
            return;
        } else if (this.type === 'uid') {
            // generate unique uid
            // this.setValue(`${this.seedValue}-${Math.floor(Math.random() * 10e10)}`);
            this.setValue(this.seedValue);
            return;
        } else {
            this.setValue(this.seedValue);
            return;
        }
    }

    async seedRelations() {
        this.key; //?
        this.type; //?
        this.attributes; //?
        this.seedValue; //?
        const targetModelName = this.attributes.target.replace('api::', '').split('.')[0]; //?

        const alsoSeededModels = this.entity.seeder.seededModelNames.filter(
            (modelName) => modelName === targetModelName
        ); //?

        if (
            alsoSeededModels?.length === 0 &&
            !this.entity.seeder?.skipModels?.includes(targetModelName) &&
            targetModelName !== this.entity.seeder.modelName
        ) {
            const seed = new Seeder({
                modelName: targetModelName,
                apiPath: this.entity.seeder.apiPath,
                seededModelNames: this.entity.seeder.seededModelNames,
                skipModels: [...(this.entity.seeder?.skipModels || []), this.entity.seeder.modelName].filter(
                    (model) => {
                        return model !== targetModelName;
                    }
                ),
                seededModels: this.entity.seeder.seededModels,
            });
            await seed.setSchema();
            await seed.setSeed();
            await seed.seedEntites();
        }

        if (!this.seedValue) {
            return;
        }

        if (this.entity.seeder.modelName === 'attribute-key') {
            console.log('🚀 ~ seedRelations ~ this.entity.seeder.modelName:', this.entity.seeder.modelName);
        }

        if (Array.isArray(this.seedValue)) {
            if (!this.seedValue?.length) {
                return;
            }

            for (const relationSeedValue of this.seedValue) {
                let id;
                if (relationSeedValue.id) {
                    id = this.entity.seeder.seededModels[targetModelName]?.find((seededItems) => {
                        if (seededItems.old.id === relationSeedValue.id) {
                            return true;
                        }
                    })?.new?.id;
                }
                const filters = setFilters({
                    entity: relationSeedValue,
                    toSkip: this.entity.keysToSkip,
                    seeder: this.entity.seeder,
                    id,
                });
                const [relationEntity] = await strapi.entityService.findMany(this.attributes.target, {
                    filters,
                });

                if (relationEntity) {
                    this.setValue(relationEntity);
                }
            }
        } else {
            let id;
            if (this.seedValue.id) {
                id = this.entity.seeder.seededModels[targetModelName]?.find((seededItems) => {
                    if (seededItems.old.id === this.seedValue.id) {
                        return true;
                    }
                })?.new?.id;
            }
            const filters = setFilters({
                entity: this.seedValue,
                toSkip: this.entity.keysToSkip,
                seeder: this.entity.seeder,
                id,
            });

            filters; //?
            const [relationEntity] = await strapi.entityService.findMany(this.attributes.target, {
                filters,
            });

            if (relationEntity) {
                this.setValue(relationEntity);
            }
        }

        this.entity.seeder.modelName; //?
    }

    async seedLocalizations() {
        const localizations = [];

        for (const localizationSeedValue of this.seedValue) {
            this.entity.seeder.apiPath; //?
            this.seedValue; //?
            this.attributes; //?
            localizationSeedValue; //?
            delete localizationSeedValue.localizations;

            this.seedValue; //?

            const entity = new Entity({
                seed: localizationSeedValue,
                schema: this.schema,
                seeder: this.entity.seeder,
            }); //?

            const ceatedEntity = await entity.create();

            localizations.push(ceatedEntity);
        }

        return localizations;
    }

    async seedComponents() {
        const components = [];

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

            components.push(entity.data);
        }

        return components;
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

function setFilters({ entity, toSkip = [], id }) {
    const filters = {};

    if (id) {
        filters['id'] = id;
    } else {
        for (const relationSeedValueKey of Object.keys(entity)) {
            relationSeedValueKey; //?
            if (toSkip.includes(relationSeedValueKey)) {
                continue;
            }

            if (
                typeof entity[relationSeedValueKey] === 'string' ||
                typeof entity[relationSeedValueKey] === 'number'
            ) {
                filters[relationSeedValueKey] = entity[relationSeedValueKey];
            }
        }
    }

    return filters;
}
