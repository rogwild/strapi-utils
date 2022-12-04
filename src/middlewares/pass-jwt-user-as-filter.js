/**
 * Функция пробрасывает id пользователя, отправившего запрос в ctx.request.body.data.user
 */
module.exports = () => {
    return async (ctx, next) => {
        ctx.query = { ...ctx.query, filters: { ...ctx.query.filters, user: ctx.state.user.id } };

        await next();
    };
};
