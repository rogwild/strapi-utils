const { passValueToBody } = require('../api');

/**
 * Функция пробрасывает id пользователя, отправившего запрос в ctx.request.body.data.user
 */
module.exports = () => {
    return async (ctx, next) => {
        passValueToBody({ ctx, key: 'user', value: ctx.state.user.id });

        await next();
    };
};
