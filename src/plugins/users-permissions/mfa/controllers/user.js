const speakeasy = require('speakeasy');
const QR = require('qrcode');
const { getService } = require('@strapi/plugin-users-permissions/server/utils');
const { parseBody } = require('@strapi/strapi/lib/core-api/controller/transform');

const utils = require('@strapi/utils');
const { sanitize } = utils;
const { ApplicationError, ValidationError } = utils.errors;

const sanitizeUser = (user, ctx) => {
    const { auth } = ctx.state;
    const userSchema = strapi.getModel('plugin::users-permissions.user');

    return sanitize.contentAPI.output(user, userSchema, { auth });
};

module.exports = {
    async generateOtpSecret(ctx) {
        const name = strapi.plugins['users-permissions'].config('appName');
        const secret = speakeasy.generateSecret({ length: 15, name });
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
        ).catch((err) => {
            throw new ApplicationError(err.message);
        });

        const secretHashCode = secret.base32;

        return ctx.send({
            secretHashCode,
            secretQrCode,
        });
    },

    async setOtp(ctx) {
        const { data, files } = parseBody(ctx);

        const { id } = ctx.params;
        const user = await strapi.entityService.findOne('plugin::users-permissions.user', id);

        if (user.otp_enabled) {
            throw new ApplicationError('Delete previous OTP before adding new');
        }

        if (data.otp_secret && data.code) {
            const isValid = speakeasy.totp.verify({
                secret: data.otp_secret,
                encoding: 'base32',
                token: data.code,
            });

            if (!isValid) {
                throw new ValidationError('Invalid code');
            }
        }

        const entity = await strapi.entityService.update('plugin::users-permissions.user', id, {
            data: {
                otp_secret: data.otp_secret,
                otp_enabled: true,
            },
            files,
        });

        const sanitizedData = await sanitizeUser(entity, ctx);

        ctx.send(sanitizedData);
    },

    async checkOtp(ctx) {
        const { id } = ctx.params;
        const { code } = ctx.query;

        const userService = getService('user');
        const jwtService = getService('jwt');

        const user = await userService.fetch(id);
        if (!user.otp_secret) {
            throw new ValidationError('2FA is not active');
        }

        const isValid = speakeasy.totp.verify({
            secret: user.otp_secret,
            encoding: 'base32',
            token: code,
        });

        if (!isValid) {
            throw new ValidationError('Invalid code');
        }

        ctx.send({
            jwt: jwtService.issue({ id: user.id }),
            user: await sanitizeUser(user, ctx),
        });
    },

    async deleteOtp(ctx) {
        // console.log(`🚀 ~ deleteOtp ~ ctx`, ctx)
        return;
    },
};
