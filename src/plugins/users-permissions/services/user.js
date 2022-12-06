const urlJoin = require('url-join');
const { getAbsoluteServerUrl, sanitize } = require('@strapi/utils');
const { getService } = require('@strapi/plugin-users-permissions/server/utils');

const sanitizeUser = (user, ctx) => {
    const { auth } = ctx.state;
    const userSchema = strapi.getModel('plugin::users-permissions.user');

    return sanitize.contentAPI.output(user, userSchema, { auth });
};

module.exports = {
    async loginOrStart2FA({ user, ctx }) {
        if (user.otp_secret) {
            return ctx.send({
                nextAuthFactor: 'otp',
                user: await sanitizeUser(user, ctx),
            });
        }

        const userService = getService('user');

        // Проблемы с отправкой кода
        if (
            user.phone_number_confirmed &&
            user.phone_number &&
            typeof userService.sendPhoneConfirmation !== 'undefined'
        ) {
            await userService.sendPhoneConfirmation(user);
            return ctx.send({
                nextAuthFactor: 'phone',
                user: await sanitizeUser(user, ctx),
            });
        }

        if (user.confirmed) {
            await userService.sendConfirmationEmail({ user, ctx });
            return ctx.send({
                nextAuthFactor: 'email',
                user: await sanitizeUser(user, ctx),
            });
        }

        return ctx.send({
            jwt: getService('jwt').issue({
                id: user.id,
            }),
            user: await sanitizeUser(user, ctx),
        });
    },

    async sendConfirmationEmail({ user, ctx }) {
        const userPermissionService = getService('users-permissions');
        const pluginStore = await strapi.store({ type: 'plugin', name: 'users-permissions' });
        const userSchema = strapi.getModel('plugin::users-permissions.user');

        const settings = await pluginStore
            .get({ key: 'email' })
            .then((storeEmail) => storeEmail['email_confirmation'].options);

        // Sanitize the template's user information
        const sanitizedUserInfo = await sanitize.sanitizers.defaultSanitizeOutput(userSchema, user);

        const confirmationToken = `${Math.floor(100000 + Math.random() * 900000)}`;

        await strapi.entityService.update('plugin::users-permissions.user', user.id, {
            data: { confirmationToken },
        });

        const apiPrefix = strapi.config.get('api.rest.prefix');
        settings.message = await userPermissionService.template(settings.message, {
            URL: urlJoin(getAbsoluteServerUrl(strapi.config), apiPrefix, '/auth/email-confirmation'),
            USER: sanitizedUserInfo,
            CODE: confirmationToken,
        });

        settings.object = await userPermissionService.template(settings.object, {
            USER: sanitizedUserInfo,
        });

        if (sanitizedUserInfo.email?.includes('example.com')) {
            console.log('🚀 ~ sendConfirmationEmail ~ confirmationToken', confirmationToken);
        }

        // Send an email to the user.
        await strapi
            .plugin('email')
            .service('email')
            .send({
                to: user.email,
                from:
                    settings.from.email && settings.from.name
                        ? `${settings.from.name} <${settings.from.email}>`
                        : undefined,
                replyTo: settings.response_email,
                subject: settings.object,
                text: settings.message,
                html: settings.message,
            })
            .then((res) => {
                console.log('sendConfirmationEmail', res);
            })
            .catch((err) => {
                console.log('sendConfirmationEmail err', err);
            });
    },

    async sendPhoneConfirmation({ user, ctx }) {
        const userService = getService('user');
        if (typeof userService.sendPhoneConfirmationCode !== 'function') {
            return ctx.badRequest('userService.sendPhoneConfirmationCode method not defined');
        }

        const phoneNumberConfirmationToken = `${Math.floor(100000 + Math.random() * 900000)}`;

        await strapi.entityService.update('plugin::users-permissions.user', user.id, {
            data: { phoneNumberConfirmationToken },
        });

        console.log('send sms code:', phoneNumberConfirmationToken);

        await userService.sendPhoneConfirmationCode({
            phoneNumber: user.phone_number,
            phoneNumberConfirmationToken,
        });
    },
};
