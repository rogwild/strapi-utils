'use strict';

const _ = require('lodash');
const { getService } = require('@strapi/plugin-users-permissions/server/utils');
const { parseBody } = require('@strapi/strapi/lib/core-api/controller/transform');
const {
    validateCallbackBody,
    validateRegisterBody,
    validateSendEmailConfirmationBody,
    validateForgotPasswordBody,
    validateResetPasswordBody,
    validateEmailConfirmationBody,
    validateChangePasswordBody,
} = require('@strapi/plugin-users-permissions/server/controllers/validation/auth');
const utils = require('@strapi/utils');
const crypto = require('crypto');
const { getAbsoluteAdminUrl, getAbsoluteServerUrl, sanitize } = utils;
const { getAuthFactorsParams, factorsMiddleware } = require('../utils');

const emailRegExp =
    /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

const sanitizeOutput = (user, ctx) => {
    const { auth } = ctx.state;
    const userSchema = strapi.getModel('plugin::users-permissions.user');

    return sanitize.contentAPI.output(user, userSchema, { auth });
};

module.exports = {
    async callback(ctx) {
        const provider = ctx.params.provider || 'local';
        const { query } = ctx.request;
        const { data } = parseBody(ctx);
        const nextAuthFactorKey = ctx.headers['next-auth-factor-key'];

        const store = strapi.store({ type: 'plugin', name: 'users-permissions' });
        const grantSettings = await store.get({ key: 'grant' });

        const grantProvider = provider === 'local' ? 'email' : provider;

        if (!_.get(grantSettings, [grantProvider, 'enabled'])) {
            return ctx.badRequest('This provider is disabled');
        }

        if (provider === 'local') {
            await validateCallbackBody(data);

            if (nextAuthFactorKey) {
                console.log('🚀 ~ callback ~ nextAuthFactorKey', nextAuthFactorKey);
            }

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

            const authFactors = strapi.plugins['users-permissions'].config('authFactors');

            return factorsMiddleware({ ctx, authFactors, user, nextAuthFactorKey });
        }

        // Connect the user with the third-party provider.
        try {
            const user = await getService('providers').connect(provider, ctx.query);

            return ctx.send({
                jwt: getService('jwt').issue({ id: user.id }),
                user: await sanitizeOutput(user, ctx),
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

        if (!data.username) {
            data.username = data.email;
        }

        try {
            await validateRegisterBody(data);
        } catch (error) {
            console.log('🚀 ~ register ~ error:', error);
            return ctx.badRequest(error?.name || 'Register Internal Server Error', error?.errors);
        }

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

        const sanitizedUser = await sanitizeOutput(user, ctx);

        if (settings.email_confirmation) {
            try {
                await getService('user').sendConfirmationEmail({ user, ctx });
            } catch (err) {
                return ctx.badRequest(err.message);
            }

            const newNextAuthFactorKey = getService('jwt').issue({
                nextAuthFactor: 'auth.emailConfirmation',
            });

            const entity = await strapi.entityService.update('plugin::users-permissions.user', user.id, {
                data: {
                    next_auth_factor_key: newNextAuthFactorKey,
                },
            });

            return ctx.send({
                next_uth_factor: 'auth.emailConfirmation',
                next_auth_factor_ey: newNextAuthFactorKey,
                user: sanitizedUser,
            });
        }

        const jwt = getService('jwt').issue(_.pick(user, ['id']));

        return ctx.send({
            jwt,
            user: sanitizedUser,
        });
    },

    async emailConfirmation(ctx) {
        const { code: confirmationToken, email } = ctx.query;
        let id = ctx.query.id;

        const nextAuthFactorKey = ctx.headers['next-auth-factor-key'];

        if (_.isEmpty(confirmationToken)) {
            return ctx.badRequest('Token is invalid');
        }

        if (!id) {
            const [user] = await strapi.entityService.findMany('plugin::users-permissions.user', {
                filters: {
                    email,
                },
            });

            if (user) {
                id = user.id;
            }
        }

        if (!id) {
            return ctx.badRequest('User not found');
        }

        let user;
        try {
            user = await strapi
                .service('plugin::users-permissions.user')
                .checkEmailConfirmationCode({ code: confirmationToken, id });
        } catch (error) {
            return ctx.badRequest(error.message);
        }

        if (!user.confirmed) {
            await strapi.entityService.update('plugin::users-permissions.user', user.id, {
                data: {
                    confirmed: true,
                },
            });

            return ctx.send({
                data: {
                    email_confirmed: true,
                },
            });
        }

        const authFactors = strapi.plugins['users-permissions'].config('authFactors');

        return factorsMiddleware({ ctx, user, authFactors, nextAuthFactorKey });
    },

    async sendEmailConfirmation(ctx) {
        const { data } = parseBody(ctx);

        const params = data;

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

    async forgotPassword(ctx) {
        const { data } = parseBody(ctx);
        await validateForgotPasswordBody(data);
        const { email } = data;

        const pluginStore = await strapi.store({ type: 'plugin', name: 'users-permissions' });

        const emailSettings = await pluginStore.get({ key: 'email' });
        const advancedSettings = await pluginStore.get({ key: 'advanced' });

        // Find the user by email.
        const user = await strapi
            .query('plugin::users-permissions.user')
            .findOne({ where: { email: email.toLowerCase() } });

        if (!user || user.blocked) {
            return ctx.send({ ok: true });
        }

        // Generate random token.
        const userInfo = await sanitizeOutput(user, ctx);

        const resetPasswordToken = crypto.randomBytes(64).toString('hex');

        const resetPasswordSettings = _.get(emailSettings, 'reset_password.options', {});

        const appName = strapi.plugins['email'].config('appName');
        const emailConfig = strapi.config.get('plugin.email');

        if (resetPasswordSettings?.from?.email && emailConfig?.settings?.defaultFrom) {
            resetPasswordSettings.from.email = emailConfig.settings.defaultFrom;
            resetPasswordSettings.from.name = appName || 'Backend';
        }

        const emailBody = await getService('users-permissions').template(resetPasswordSettings.message, {
            URL: advancedSettings.email_reset_password,
            SERVER_URL: getAbsoluteServerUrl(strapi.config),
            ADMIN_URL: getAbsoluteAdminUrl(strapi.config),
            USER: userInfo,
            TOKEN: resetPasswordToken,
        });

        const emailObject = await getService('users-permissions').template(resetPasswordSettings.object, {
            USER: userInfo,
        });

        const emailToSend = {
            to: user.email,
            from:
                resetPasswordSettings.from.email || resetPasswordSettings.from.name
                    ? `${resetPasswordSettings.from.name} <${resetPasswordSettings.from.email}>`
                    : undefined,
            replyTo: resetPasswordSettings.response_email,
            subject: emailObject,
            text: emailBody,
            html: emailBody,
        };

        // NOTE: Update the user before sending the email so an Admin can generate the link if the email fails
        await getService('user').edit(user.id, { resetPasswordToken });

        // Send an email to the user.
        await strapi.plugin('email').service('email').send(emailToSend);

        ctx.send({ ok: true });
    },

    async resetPassword(ctx) {
        const { data } = parseBody(ctx);

        await validateResetPasswordBody(data);

        const { password, passwordConfirmation, code } = data;

        if (password !== passwordConfirmation) {
            return ctx.badRequest('Passwords do not match');
        }

        const user = await strapi
            .query('plugin::users-permissions.user')
            .findOne({ where: { resetPasswordToken: code } });

        if (!user) {
            return ctx.badRequest('Incorrect code provided');
        }

        await getService('user').edit(user.id, {
            resetPasswordToken: null,
            password,
        });

        ctx.send({ ok: true });
    },

    async changePassword(ctx) {
        if (!ctx.state.user) {
            return ctx.badRequest('You must be authenticated to reset your password');
        }

        const { data } = parseBody(ctx);

        const { currentPassword, password } = await validateChangePasswordBody(data);

        const user = await strapi.entityService.findOne('plugin::users-permissions.user', ctx.state.user.id);

        const validPassword = await getService('user').validatePassword(currentPassword, user.password);

        if (!validPassword) {
            return ctx.badRequest('The provided current password is invalid');
        }

        if (currentPassword === password) {
            return ctx.badRequest('Your new password must be different than your current password');
        }

        await getService('user').edit(user.id, { password });

        ctx.send({
            jwt: getService('jwt').issue({ id: user.id }),
            user: await sanitizeOutput(user, ctx),
        });
    },

    async sendPhoneConfirmation(ctx) {
        const { data } = parseBody(ctx);

        const { phone } = data;

        if (!phone) {
            return ctx.badRequest('Pass phone for sending code');
        }

        const [user] = await strapi.entityService.findMany('plugin::users-permissions.user', {
            filters: {
                phone: phone,
            },
        });

        if (!user) {
            return ctx.badRequest('Wrong email');
        }

        await strapi.service('plugin::users-permissions.user').sendPhoneConfirmation({ user, ctx });

        return ctx.send({
            data: {
                phone,
                sent: true,
            },
        });
    },

    async phoneConfirmation(ctx) {
        const { code: confirmationToken, phone } = ctx.query;
        let id = ctx.query.id;
        const nextAuthFactorKey = ctx.headers['next-auth-factor-key'];

        if (!confirmationToken) {
            return ctx.badRequest('token.invalid');
        }

        if (!id) {
            const [user] = await strapi.entityService.findMany('plugin::users-permissions.user', {
                filters: {
                    phone,
                },
            });

            if (user) {
                id = user.id;
            }
        }

        if (!id) {
            return ctx.badRequest('User not found');
        }

        let user;
        try {
            user = await strapi
                .service('plugin::users-permissions.user')
                .checkPhoneConfirmationCode({ code: confirmationToken, id });
        } catch (error) {
            return ctx.badRequest(error.message);
        }

        if (!user.phone_confirmed) {
            await strapi.entityService.update('plugin::users-permissions.user', user.id, {
                data: {
                    phone_confirmed: true,
                },
            });

            return ctx.send({
                data: {
                    phone_confirmed: true,
                },
            });
        }

        const authFactors = strapi.plugins['users-permissions'].config('authFactors');

        return factorsMiddleware({ ctx, authFactors, user, nextAuthFactorKey });
    },

    async checkFactors(ctx) {
        const { query } = ctx.request;
        const { data } = parseBody(ctx);
        const nextAuthFactorKey = ctx.headers['next-auth-factor-key'];
        const currentFactor = data.current;

        const user = await strapi.entityService.findOne('plugin::users-permissions.user', data.id);

        if (!data.id) {
            return ctx.badRequest('No user id provided');
        }

        try {
            for (const model of Object.keys(data)) {
                for (const handler of Object.keys(data[model])) {
                    if (model === 'user') {
                        if (handler === 'checkOtp') {
                            await strapi
                                .service('plugin::users-permissions.user')
                                .checkOtpCode({ code: data[model][handler], id: data.id, ctx });
                        }
                    } else if (model === 'auth') {
                        if (handler === 'phoneConfirmation') {
                            await strapi
                                .service('plugin::users-permissions.user')
                                .checkPhoneConfirmationCode({
                                    code: data[model][handler],
                                    id: data.id,
                                    ctx,
                                });
                        } else if (handler === 'emailConfirmation') {
                            await strapi
                                .service('plugin::users-permissions.user')
                                .checkEmailConfirmationCode({
                                    code: data[model][handler],
                                    id: data.id,
                                    ctx,
                                });
                        }
                    }
                }
            }
        } catch (error) {
            return ctx.badRequest(error.message);
        }

        const authFactors = strapi.plugins['users-permissions'].config('authFactors');

        await strapi.entityService.update('plugin::users-permissions.user', data.id, {
            data: {
                phone_confirmation_token: null,
                confirmationToken: null,
            },
        });

        return factorsMiddleware({ ctx, authFactors, user, nextAuthFactorKey, currentFactor });
    },
};
