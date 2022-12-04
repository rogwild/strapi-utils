'use strict';

const { PolicyError, NotFoundError } = require('@strapi/utils').errors;

const userHandlers = ['user.update'];
/**
 * Политика проверки уровня доступа пользователя с переданным JWT
 * Проверяет является ли пользователь владельцем запрашиваемой
 * для взаимодействия модели
 */
module.exports = async (ctx) => {
    const { id } = ctx.params; //?
    const { route, user } = ctx.state;
    const { apiName, pluginName } = route.info; //?
    let model = apiName || pluginName;

    if (ctx.state.auth.credentials?.type === 'full-access') {
        return true;
    }

    if (userHandlers.includes(route.handler)) {
        return +id === user.id;
    }

    const item = await strapi.entityService.findOne(`api::${model}.${model}`, id, {
        populate: {
            user: true,
            users: true,
        },
    });

    if (!item) {
        throw new NotFoundError();
    }

    if (item.user && item.user.id === user.id) {
        return true;
    } else if (item.users?.length && item.users.find((member) => member.id === user.id)) {
        return true;
    }

    throw new PolicyError('Your account is not authentificated for this action');
};
