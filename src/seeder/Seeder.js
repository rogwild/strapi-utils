const axios = require('axios');
const fs = require('fs/promises');
const path = require('path');

class Seeder {
    constructor({ modelName, apiPath, skipModels, seededModels }) {
        this.modelName = modelName;
        this.apiPath = apiPath;
        this.skipModels = skipModels;
        this.seededModels = seededModels;
    }

    async setSeed() {
        const pathToSeed = path.join(
            this.apiPath,
            `/${this.modelName}/content-types/${this.modelName}/seeds`
        );

        let seedFiles;
        try {
            seedFiles = await fs.readdir(pathToSeed);
        } catch (error) {
            console.log('🚀 ~ setSeed ~ no seed for model:', this.modelName, ' skipping migration');
        }

        if (!seedFiles?.length) {
            return;
        }

        if (this.schema.kind === 'singleType' && seedFiles.length > 1) {
            throw new Error('Single Type entity can have just one json file');
        }

        for (const seedFile of seedFiles) {
            const seed = await fs.readFile(`${pathToSeed}/${seedFile}`, 'utf8').catch((error) => {
                // console.log(`🚀 ~ seed ~ error`, error);
            });

            if (this.schema.kind === 'collectionType') {
                if (!this.seed) {
                    this.seed = [];
                }

                this.seed = [...this.seed, JSON.parse(seed)];
            } else {
                this.seed = JSON.parse(seed);
            }
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
            this.seededModels[this.modelName] = undefined;
            return;
        }

        if (this.schema.kind === 'collectionType') {
            for (const seedItem of this.seed) {
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
        } else if (this.schema.kind === 'singleType') {
            const sanitizedSeed = { ...this.seed };

            if (sanitizedSeed.localizations) {
                sanitizedSeed.localizations = [];
                sanitizedSeed.seeder_filter_by = ['locale'];
            }

            const entity = new Entity({
                seed: sanitizedSeed,
                schema: this.schema,
                seeder: this,
            });
            const mainEntityCreated = await entity.create();
            if (mainEntityCreated) {
                createdEntites.push({
                    old: this.seed,
                    new: mainEntityCreated,
                });

                this.seededModels[this.modelName] = [
                    {
                        old: this.seed,
                        new: mainEntityCreated,
                    },
                ];
            }

            if (this.seed?.localizations?.length) {
                for (const localization of this.seed.localizations) {
                    const entity = new Entity({
                        seed: { ...localization, seeder_filter_by: ['locale'] },
                        schema: this.schema,
                        seeder: this,
                    });
                    const created = await entity.create();
                    if (created) {
                        createdEntites.push({
                            old: this.seed,
                            new: created,
                        });
                    }

                    const mainEntity = await strapi.entityService.update(
                        `api::${this.modelName}.${this.modelName}`,
                        mainEntityCreated.id,
                        {
                            populate: '*',
                        }
                    );

                    await strapi.db.query(`api::${this.modelName}.${this.modelName}`).update({
                        where: { id: mainEntity.id },
                        data: {
                            localizations: [...mainEntity.localizations, created.id],
                        },
                    });
                }
            }
        }
        const createdIds = createdEntites.map((createdEntity) => {
            return createdEntity.new.id;
        });

        const entites = await strapi.db.query(`api::${this.modelName}.${this.modelName}`).findMany();

        if (entites?.length) {
            for (const entity of entites) {
                if (createdIds.includes(entity.id)) {
                    continue;
                }

                await strapi.entityService.delete(`api::${this.modelName}.${this.modelName}`, entity.id);
            }
        }

        this.seededModels[this.modelName] = createdEntites;
        return createdEntites;
    }
}

class Entity {
    constructor({ seed, schema, seeder, updateEntityIfExists = true }) {
        this.seed = seed; //?
        this.schema = schema; //?
        this.data = {};
        this.seeder = seeder;
        this.updateEntityIfExists = updateEntityIfExists;
        this.keysToSkip = ['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy'];
    }

    async prepare() {
        for (const seedKey of Object.keys(this.seed)) {
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

        if (this.data) {
            console.log('🚀 ~ create ~ this.seeder.modelName:', this.seeder.modelName);

            const filters = setFilters({ entity: this.data, toSkip: this.keysToSkip, seeder: this.seeder });

            console.log('🚀 ~ create ~ filters:', filters);

            let existingEntities;

            if (Object.keys(filters)?.length) {
                existingEntities = await strapi.db
                    .query(`api::${this.seeder.modelName}.${this.seeder.modelName}`)
                    .findMany({
                        where: filters,
                    });
            }

            if (existingEntities?.length) {
                if (this.updateEntityIfExists) {
                    try {
                        const updatedEntity = await strapi.entityService.update(
                            `api::${this.seeder.modelName}.${this.seeder.modelName}`,
                            existingEntities[0].id,
                            {
                                data: this.data,
                            }
                        );

                        return updatedEntity;
                    } catch (error) {
                        console.log(
                            `🚀 ~ Entity ${this.seeder.modelName} ~ update ~ error.message:`,
                            error.message
                        );
                    }
                } else {
                    return existingEntities[0];
                }
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
                console.log(`🚀 ~ Entity ${this.seeder.modelName} ~ create ~ error.message:`, error.message);
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

        console.log('🚀 ~ seedRelations ~ targetModelName:', targetModelName);

        const alsoSeededModels = Object.keys(this.entity.seeder.seededModels).filter(
            (modelName) => modelName === targetModelName
        ); //?

        if (
            alsoSeededModels?.length === 0 &&
            targetModelName !== this.entity.seeder.modelName &&
            (this.entity.seeder.schema.attributes[this.key]?.mappedBy === this.entity.seeder.modelName ||
                this.entity.data.__component)
            // !this.entity.seeder?.skipModels?.includes(targetModelName) &&
        ) {
            const seed = new Seeder({
                modelName: targetModelName,
                apiPath: this.entity.seeder.apiPath,
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

            let id;
            if (localizationSeedValue.id) {
                id = this.entity.seeder.seededModels[this.entity.seeder.modelName]?.find((seededItems) => {
                    if (seededItems.old.id === localizationSeedValue.id) {
                        return true;
                    }
                })?.new?.id;
            }
            const filters = setFilters({
                entity: { ...localizationSeedValue },
                toSkip: this.entity.keysToSkip,
                seeder: this.entity.seeder,
                id,
            });

            filters; //?
            const relationEntities = await strapi.db
                .query(`api::${this.entity.seeder.modelName}.${this.entity.seeder.modelName}`)
                .findMany({
                    where: filters,
                });

            if (relationEntities?.length) {
                localizations.push(relationEntities[0]);
            }
        }

        return localizations;
    }

    async seedComponents() {
        if (!this.seedValue) {
            return;
        }

        if (Array.isArray(this.seedValue)) {
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

                const pathToSchema = path.join(
                    this.entity.seeder.apiPath,
                    `../components/${componentPath}.json`
                ); //?
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
        } else {
            let componentPath;

            if (this.seedValue?.__component) {
                componentPath = this.seedValue.__component.replace('.', '/'); //?
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
                seed: this.seedValue,
                schema: JSON.parse(schema),
                seeder: this.entity.seeder,
            }); //?

            await entity.prepare();

            return entity.data;
        }
    }

    async downloadFile(value) {
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

            console.log('🚀 ~ downloadFile ~ value:', value);

            const file = await axios({
                method: 'GET',
                url: value.url,
                responseType: 'arraybuffer',
                ...additionalAttributes,
            })
                .then(function (response) {
                    return response.data;
                })
                .catch((error) => {
                    console.log('🚀 ~ downloadFile ~ error:', error?.message);
                });

            if (!file) {
                return;
            }

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
        const seederFilterBy = Object.keys(entity).find((key) => key === 'seeder_filter_by');
        if (seederFilterBy && entity['seeder_filter_by']) {
            for (const filterKey of entity['seeder_filter_by']) {
                if (filterKey.includes('.')) {
                    const key = filterKey.split('.');
                    if (key.length === 2) {
                        if (entity[key[0]] && typeof entity[key[0]] === 'object') {
                            filters[key[0]] = entity[key[0]][key[1]];
                            continue;
                        }
                    }
                } else {
                    if (entity[filterKey]) {
                        filters[filterKey] = entity[filterKey];
                    }
                }
            }
        } else {
            for (const relationSeedValueKey of Object.keys(entity)) {
                relationSeedValueKey; //?
                if ([...toSkip, 'publishedAt'].includes(relationSeedValueKey)) {
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
    }

    return filters;
}
