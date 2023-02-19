const { getService } = require('@strapi/plugin-users-permissions/server/utils');
const utils = require('@strapi/utils');
const { getAbsoluteAdminUrl, getAbsoluteServerUrl, sanitize } = utils;

const sanitizeOutput = (user, ctx) => {
    const { auth } = ctx.state;
    const userSchema = strapi.getModel('plugin::users-permissions.user');

    return sanitize.contentAPI.output(user, userSchema, { auth });
};

function getActionFactorsParams({ name, user, authFactors }) {
    const factors = strapi.plugins['users-permissions'].config('authFactors');
    const { isFirst, factorIndex, isLast } = getAuthFactorIndex(name, authFactors);
    const actions = strapi.config.get('plugin.actions');

    console.log('🚀 ~ getActionFactorsParams ~ actions', actions);
}

function getAuthFactorsParams({ name, user, authFactors }) {
    const { isFirst, factorIndex, isLast } = getAuthFactorIndex(name, authFactors);

    // console.log('🚀 ~ getAuthFactorsParams ~ authFactors', authFactors);

    let nextAuthFactor = isLast ? undefined : authFactors.factors[factorIndex + 1];

    if (nextAuthFactor === 'user.checkOtp' && !user.is_otp_confirmation_enabled) {
        return getAuthFactorsParams('user.checkOtp', user);
    }

    if (nextAuthFactor === 'auth.emailConfirmation' && !user.is_email_confirmation_enabled) {
        return getAuthFactorsParams('auth.emailConfirmation', user);
    }

    if (
        nextAuthFactor === 'auth.phoneConfirmation' &&
        user.is_phone_confirmation_enabled &&
        (!user.phone || user.phone === '')
    ) {
        return getAuthFactorsParams('auth.phoneConfirmation', user);
    }

    return {
        isLast,
        isFirst,
        nextAuthFactor,
    };
}

function getAuthFactorIndex(name, authFactors) {
    authFactors;
    name;
    let isFirst = false;
    let isLast = false;
    let factorIndex = 0;

    for (const [index, authFactor] of authFactors.factors.entries()) {
        authFactor;
        if (Array.isArray(authFactor.handler)) {
            authFactor;

            for (const nestedAuthFactor of authFactor.handler) {
                nestedAuthFactor;
                if (nestedAuthFactor === name) {
                    factorIndex = index;

                    if (index === authFactors.factors.length - 1) {
                        isLast = true;
                    }

                    if (index === 0) {
                        isFirst = true;
                    }
                }
            }
        } else {
            authFactor;
            name;
            authFactors.factors;
            authFactor.handler;
            if (authFactor.handler === name) {
                factorIndex = index;

                if (index === authFactors.factors.length - 1) {
                    isLast = true;
                }

                if (index === 0) {
                    isFirst = true;
                }
            }
        }
    }

    return {
        isFirst,
        factorIndex,
        isLast,
    };
}

async function factorsMiddleware({ ctx, user, authFactors, next_auth_factor_key }) {
    const currentAuthFactorParams = getAuthFactorsParams({
        name: ctx.state.route.handler,
        user,
        authFactors,
    });

    await strapi.entityService.update('plugin::users-permissions.user', user.id, {
        data: {
            next_auth_factor_key: null,
        },
    });

    if (next_auth_factor_key) {
        if (user.next_auth_factor_key !== next_auth_factor_key) {
            return ctx.badRequest('Previous auth steps were skipped');
        }
    }

    if (!next_auth_factor_key && !currentAuthFactorParams.isFirst) {
        return ctx.badRequest('Previous auth steps were skipped');
    }

    if (currentAuthFactorParams.isLast) {
        return ctx.send({
            jwt: getService('jwt').issue({ id: user.id }),
            user: await sanitizeOutput(user, ctx),
        });
    }

    const nextAuthFactorKey = getService('jwt').issue({
        nextAuthFactor: currentAuthFactorParams.nextAuthFactor,
    });

    const entity = await strapi.entityService.update('plugin::users-permissions.user', user.id, {
        data: {
            next_auth_factor_key: nextAuthFactorKey,
        },
    });

    return ctx.send({
        nextAuthFactor: currentAuthFactorParams.nextAuthFactor,
        nextAuthFactorKey: nextAuthFactorKey,
        user: await sanitizeOutput(entity, ctx),
    });
}

module.exports = {
    getAuthFactorsParams,
    getActionFactorsParams,
    factorsMiddleware,
};
