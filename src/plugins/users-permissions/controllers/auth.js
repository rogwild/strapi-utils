'use strict';

const _ = require('lodash');
const { getService } = require('@strapi/plugin-users-permissions/server/utils');
const { parseBody } = require('@strapi/strapi/lib/core-api/controller/transform');
const {
    validateCallbackBody,
    validateRegisterBody,
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
    async callback(ctx) {
        const provider = ctx.params.provider || 'local';
        const { query } = ctx.request;
        const { data } = parseBody(ctx);

        const store = strapi.store({ type: 'plugin', name: 'users-permissions' });
        const grantSettings = await store.get({ key: 'grant' });

        const grantProvider = provider === 'local' ? 'email' : provider;

        if (!_.get(grantSettings, [grantProvider, 'enabled'])) {
            return ctx.badRequest('This provider is disabled');
        }

        if (provider === 'local') {
            await validateCallbackBody(data);

            const { identifier } = data;

            // Check if the user exists.
            const [user] = await strapi.entityService.findMany('plugin::users-permissions.user', {
                filters: {
                    $or: [{ email: identifier.toLowerCase() }, { username: identifier }],
                },
                ...query,
            });

            if (!user) {
                return ctx.badRequest('Invalid identifier or password');
            }

            if (!user.password) {
                return ctx.badRequest('Invalid identifier or password');
            }

            const validPassword = await getService('user').validatePassword(data.password, user.password);

            if (!validPassword) {
                return ctx.badRequest('Invalid identifier or password');
            }

            const advancedSettings = await store.get({ key: 'advanced' });
            const requiresConfirmation = _.get(advancedSettings, 'email_confirmation');

            if (requiresConfirmation && user.confirmed !== true) {
                return ctx.badRequest('Your account email is not confirmed');
            }

            if (user.blocked === true) {
                return ctx.badRequest('Your account has been blocked by an administrator');
            }

            return ctx.send({
                jwt: getService('jwt').issue({ id: user.id }),
                user: await sanitizeUser(user, ctx),
            });
        }

        // Connect the user with the third-party provider.
        try {
            const user = await getService('providers').connect(provider, ctx.query);

            return ctx.send({
                jwt: getService('jwt').issue({ id: user.id }),
                user: await sanitizeUser(user, ctx),
            });
        } catch (error) {
            return ctx.badRequest(error.message);
        }
    },

    async register(ctx) {
        const pluginStore = await strapi.store({ type: 'plugin', name: 'users-permissions' });

        const settings = await pluginStore.get({ key: 'advanced' });

        if (!settings.allow_register) {
            return ctx.badRequest('Register action is currently disabled');
        }

        const { query } = ctx.request;
        const { data, files } = parseBody(ctx);

        delete data.confirmed;
        delete data.blocked;
        delete data.confirmationToken;
        delete data.resetPasswordToken;
        data.provider = 'local';

        await validateRegisterBody(data);

        const role = await strapi
            .query('plugin::users-permissions.role')
            .findOne({ where: { type: settings.default_role } });

        if (!role) {
            return ctx.badRequest('Impossible to find the default role');
        }

        const { email, username, provider } = data;

        const identifierFilter = {
            $or: [
                { email: email.toLowerCase() },
                { username: email.toLowerCase() },
                { username },
                { email: username },
            ],
        };

        const conflictingUserCount = await strapi.query('plugin::users-permissions.user').count({
            where: { ...identifierFilter, provider },
        });

        if (conflictingUserCount > 0) {
            return ctx.badRequest('Email or Username are already taken');
        }

        if (settings.unique_email) {
            const conflictingUserCount = await strapi.query('plugin::users-permissions.user').count({
                where: { ...identifierFilter },
            });

            if (conflictingUserCount > 0) {
                return ctx.badRequest('Email or Username are already taken');
            }
        }

        const newUser = {
            ...data,
            role: role.id,
            email: email.toLowerCase(),
            username,
            confirmed: !settings.email_confirmation,
        };

        const user = await strapi.entityService.create('plugin::users-permissions.user', {
            data: newUser,
            files,
            ...query,
        });

        const sanitizedUser = await sanitizeUser(user, ctx);

        if (settings.email_confirmation) {
            try {
                await getService('user').sendConfirmationEmail(sanitizedUser);
            } catch (err) {
                return ctx.badRequest(err.message);
            }

            return ctx.send({ user: sanitizedUser });
        }

        const jwt = getService('jwt').issue(_.pick(user, ['id']));

        return ctx.send({
            jwt,
            user: sanitizedUser,
        });
    },

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
