const urlJoin = require('url-join');
const speakeasy = require('speakeasy');
const { getAbsoluteServerUrl, sanitize } = require('@strapi/utils');
const { getService } = require('@strapi/plugin-users-permissions/server/utils');
const ethers = require('ethers');
const { default: axios } = require('axios');

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
        if (user.phone_confirmed && user.phone && typeof userService.sendPhoneConfirmation !== 'undefined') {
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

        const settings = await pluginStore.get({ key: 'email' }).then((storeEmail) => {
            const appName = strapi.plugins['email'].config('appName');
            const emailConfig = strapi.config.get('plugin.email');

            const settings = { ...storeEmail['email_confirmation'].options };
            if (settings?.from?.email && emailConfig?.settings?.defaultFrom) {
                settings.from.email = emailConfig.settings.defaultFrom;
                settings.from.name = appName || 'Backend';
            }

            return settings;
        });

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
        const appName = strapi.plugins['users-permissions'].config('appName');
        const smsConfig = strapi.plugins['users-permissions'].config('sms');
        const phone_confirmation_token = `${Math.floor(100000 + Math.random() * 900000)}`;

        await strapi.entityService.update('plugin::users-permissions.user', user.id, {
            data: { phone_confirmation_token },
        });

        console.log('send sms code:', phone_confirmation_token);

        if (process.env.NODE_ENV === 'production') {
            await axios({
                url: `https://api.prostor-sms.ru/messages/v2/send/?phone=${user.phone}&text=${encodeURI(
                    `Code for ${appName}: ${phone_confirmation_token}`
                )}&login=${smsConfig.login}&password=${smsConfig.password}`,
            }).catch((error) => {
                console.log('🚀 ~ sendPhoneConfirmation ~ error', error);
            });
        }
    },

    checkWeb3Signature({ account, message, signature }) {
        let recoveredAddress;
        try {
            recoveredAddress = ethers.utils.verifyMessage(message, signature);
        } catch (error) {
            console.log('checkWeb3Signature', error);
        }

        return recoveredAddress && recoveredAddress.toLowerCase() === account;
    },

    async checkEmailConfirmationCode({ code, id, ctx }) {
        const user = await strapi.entityService.findOne('plugin::users-permissions.user', id);

        if (user.confirmationToken !== code) {
            throw new Error('Invalid code');
        } else {
            await strapi.entityService.update('plugin::users-permissions.user', id, {
                data: {
                    confirmationToken: null,
                },
            });
        }

        return user;
    },

    async checkPhoneConfirmationCode({ code, id, ctx }) {
        const user = await strapi.entityService.findOne('plugin::users-permissions.user', id);

        if (user.phone_confirmation_token !== code) {
            throw new Error('Invalid code');
        } else {
            await strapi.entityService.update('plugin::users-permissions.user', id, {
                data: {
                    phone_confirmation_token: null,
                },
            });
        }

        return user;
    },

    async checkOtpCode({ ctx, id, code }) {
        const user = await strapi.entityService.findOne('plugin::users-permissions.user', id);

        if (!user.is_otp_confirmation_enabled) {
            return ctx.badRequest('2FA is not active');
        }

        const isValid = speakeasy.totp.verify({
            secret: user.otp_secret,
            encoding: 'base32',
            token: code,
        });

        if (!isValid) {
            throw new Error('Invalid code');
        }

        return user;
    },
};
