async function setModelPreviousValue({ event }) {
    const modelName = event.model.uid.split('.')[1];

    if (!strapi.actions) {
        strapi.actions = {};
    }

    if (!strapi.actions[modelName]) {
        strapi.actions[modelName] = {};
    }
    const id = event.params.where.id;
    if (id) {
        const before = await strapi.entityService.findOne(event.model.uid, id);
        strapi.actions[modelName][id] = { before };
    }
}

async function getModelPreviousValue({ event }) {
    const modelName = event.model.uid.split('.')[1];
    const id = event.params.where.id;

    try {
        const before = strapi.actions[modelName][id]?.before;

        return before;
    } catch (error) {
        console.log('getModelPreviousValue', error.message);
    }
}

async function removeModelPreviousValue({ event }) {
    const modelName = event.model.uid.split('.')[1];
    const id = event.params.where.id;
    if (strapi.actions && strapi.actions[modelName]) {
        return delete strapi.actions[modelName][id];
    }
}

module.exports = {
    setModelPreviousValue,
    getModelPreviousValue,
    removeModelPreviousValue,
};
