const speakeasy = require('speakeasy');
const QR = require('qrcode');
const { getService } = require('@strapi/plugin-users-permissions/server/utils');
const { parseBody } = require('@strapi/strapi/lib/core-api/controller/transform');
const { sanitize } = require('@strapi/utils');
const {
    validateCreateUserBody,
    validateUpdateUserBody,
} = require('@strapi/plugin-users-permissions/server/controllers/validation/user');
const { getAuthFactorsParams } = require('../utils');

const sanitizeOutput = (user, ctx) => {
    const { auth } = ctx.state;
    const userSchema = strapi.getModel('plugin::users-permissions.user');

    return sanitize.contentAPI.output(user, userSchema, { auth });
};

module.exports = {
    async generateOtpSecret(ctx) {
        const name = strapi.plugins['users-permissions'].config('appName');
        const secret = speakeasy.generateSecret({ length: 15, name });

        try {
            const secretQrCode = await new Promise((resolve, reject) =>
                QR.toDataURL(secret.otpauth_url, (err, data_url) => {
                    if (err) {
                        console.error('createOtpSecret QR.toDataURL', err?.message);
                        reject({
                            id: 'AuthFactor.error.qr-code.generate',
                            message: err?.message,
                        });
                    }
                    resolve(data_url);
                })
            );

            const secretHashCode = secret.base32;

            return ctx.send({
                secretHashCode,
                secretQrCode,
            });
        } catch (err) {
            return ctx.badRequest(err.message);
        }
    },

    async setOtp(ctx) {
        const { data, files } = parseBody(ctx);

        const { id } = ctx.params;
        const user = await strapi.entityService.findOne('plugin::users-permissions.user', id);

        if (user.is_otp_confirmation_enabled) {
            return ctx.badRequest('Delete previous OTP before adding new');
        }

        if (data.otp_secret && data.code) {
            const isValid = speakeasy.totp.verify({
                secret: data.otp_secret,
                encoding: 'base32',
                token: data.code,
            });

            if (!isValid) {
                return ctx.badRequest('Invalid code');
            }
        }

        const entity = await strapi.entityService.update('plugin::users-permissions.user', id, {
            data: {
                otp_secret: data.otp_secret,
                is_otp_confirmation_enabled: true,
            },
            files,
        });

        const sanitizedData = await sanitizeOutput(entity, ctx);

        ctx.send(sanitizedData);
    },

    async checkOtp(ctx) {
        const { id } = ctx.params;
        const { code } = ctx.query;
        const next_auth_factor_key = ctx.headers['next-auth-factor-key'];

        const userService = getService('user');
        const jwtService = getService('jwt');

        const user = await userService.fetch(id);
        if (!user.is_otp_confirmation_enabled) {
            return ctx.badRequest('2FA is not active');
        }

        const authFactors = getAuthFactorsParams('user.checkOtp', user);

        if (
            user.next_auth_factor_key !== next_auth_factor_key ||
            (!next_auth_factor_key && !authFactors.isFirst)
        ) {
            return ctx.badRequest('Previous auth steps were skipped');
        }

        const isValid = speakeasy.totp.verify({
            secret: user.otp_secret,
            encoding: 'base32',
            token: code,
        });

        if (!isValid) {
            return ctx.badRequest('Invalid code');
        }

        await strapi.entityService.update('plugin::users-permissions.user', user.id, {
            data: {
                next_auth_factor_key: null,
            },
        });

        if (authFactors.isLast) {
            return ctx.send({
                jwt: getService('jwt').issue({ id: user.id }),
                user: await sanitizeOutput(user, ctx),
            });
        }

        const nextAuthFactorKey = getService('jwt').issue({
            nextAuthFactor: authFactors.nextAuthFactor,
        });

        const entity = await strapi.entityService.update('plugin::users-permissions.user', user.id, {
            data: {
                next_auth_factor_key: nextAuthFactorKey,
            },
        });

        return ctx.send({
            nextAuthFactor: authFactors.nextAuthFactor,
            nextAuthFactorKey: nextAuthFactorKey,
            user: await sanitizeOutput(entity, ctx),
        });
    },

    async deleteOtp(ctx) {
        const { id } = ctx.params;
        const { code } = ctx.query;

        const userService = getService('user');

        const user = await userService.fetch(id);
        if (!user.is_otp_confirmation_enabled) {
            return ctx.badRequest('2FA is not active');
        }

        const isValid = speakeasy.totp.verify({
            secret: user.otp_secret,
            encoding: 'base32',
            token: code,
        });

        if (!isValid) {
            return ctx.badRequest('Invalid code');
        }

        const entity = await strapi.entityService.update('plugin::users-permissions.user', id, {
            data: {
                otp_secret: '',
                is_otp_confirmation_enabled: false,
            },
        });

        const sanitizedUser = await sanitizeOutput(entity, ctx);

        ctx.send(sanitizedUser);
    },

    /**
     * Update a/an user record.
     * @return {Object}
     */
    async update(ctx) {
        const advancedConfigs = await strapi
            .store({ type: 'plugin', name: 'users-permissions', key: 'advanced' })
            .get();

        const { id } = ctx.params;
        const { query } = ctx.request;
        const { data, files } = parseBody(ctx);

        const { email, username, password } = data;

        const user = await strapi.entityService.findOne('plugin::users-permissions.user', id);
        if (!user) {
            return ctx.badRequest('User not found');
        }

        await validateUpdateUserBody(data);

        if (user.provider === 'local' && password !== undefined && password === '') {
            return ctx.badRequest('password.notNull');
        }

        if (username) {
            const [usersWithSameUsername] = await strapi.entityService.findMany(
                'plugin::users-permissions.user',
                {
                    filters: {
                        username,
                    },
                }
            );

            if (usersWithSameUsername && usersWithSameUsername.id !== parseInt(id)) {
                return ctx.badRequest('Username already taken');
            }
        }

        if (email && advancedConfigs.unique_email) {
            const usersWithSameEmail = await strapi.entityService.findMany('plugin::users-permissions.user', {
                filters: {
                    email: email.toLowerCase(),
                },
            });

            if (usersWithSameEmail.length && usersWithSameEmail[0].id !== id) {
                return ctx.badRequest('Email already taken');
            }

            data.email = email.toLowerCase();
        }

        const updateData = {
            ...data,
        };

        const entity = await strapi.entityService.update('plugin::users-permissions.user', id, {
            ...query,
            data: updateData,
            files,
        });
        const sanitizedData = await sanitizeOutput(entity, ctx);

        ctx.send(sanitizedData);
    },
};
