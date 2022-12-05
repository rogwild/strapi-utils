'use strict';

const _ = require('lodash');
const { getService } = require('@strapi/plugin-users-permissions/server/utils');
const {
    validateSendEmailConfirmationBody,
} = require('@strapi/plugin-users-permissions/server/controllers/validation/auth');

const utils = require('@strapi/utils');
const { sanitize } = utils;

const emailRegExp =
    /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

const sanitizeUser = (user, ctx) => {
    const { auth } = ctx.state;
    const userSchema = strapi.getModel('plugin::users-permissions.user');

    return sanitize.contentAPI.output(user, userSchema, { auth });
};

module.exports = {
    async emailConfirmation(ctx) {
        const { code: confirmationToken, email } = ctx.query;

        const userService = getService('user');
        const jwtService = getService('jwt');

        if (_.isEmpty(confirmationToken)) {
            return ctx.badRequest('Token is invalid');
        }

        const [user] = await strapi.entityService.findMany('plugin::users-permissions.user', {
            filters: {
                confirmationToken,
                email,
            },
        });

        if (!user) {
            return ctx.badRequest('Token is invalid');
        }

        await userService.edit(user.id, { confirmed: true, confirmationToken: null });

        ctx.send({
            jwt: jwtService.issue({ id: user.id }),
            user: await sanitizeUser(user, ctx),
        });
    },

    async sendEmailConfirmation(ctx) {
        const params = _.assign(ctx.request.body);

        await validateSendEmailConfirmationBody(params);

        params.email = params.email.toLowerCase();

        const isEmail = emailRegExp.test(params.email);

        if (!isEmail) {
            return ctx.badRequest('Wrong email');
        }

        let user = await strapi.query('plugin::users-permissions.user').findOne({
            where: { email: params.email },
        });

        const registerByEmailCode = strapi.plugins['users-permissions'].config('registerByEmailCode');
        if (!user) {
            if (ctx.state.user) {
                user = ctx.state.user;

                user.email = params.email;
            } else if (registerByEmailCode) {
                user = await strapi.query('plugin::users-permissions.user').create({
                    data: {
                        email: params.email,
                        provider: 'email',
                        role: 1, // authenticated
                        confirmed: false,
                    },
                });
            }

            if (!user) {
                return ctx.badRequest('No user');
            }
        }

        if (user.blocked) {
            return ctx.badRequest('User is blocked');
        }

        try {
            await getService('user').sendConfirmationEmail({ user, ctx });
            ctx.send({
                email: user.email,
                sent: true,
            });
        } catch (err) {
            console.log(err);
            return ctx.badRequest(err.message);
        }
    },

    /**
     * @todo
     */
    async sendPhoneConfirmation(ctx) {},

    /**
     * @todo
     */
    async phoneConfirmation(ctx) {},
};
