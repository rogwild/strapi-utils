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

    if (nextAuthFactor?.handler === 'user.checkOtp' && !user.is_otp_confirmation_enabled) {
        return getAuthFactorsParams({ name: 'user.checkOtp', user, authFactors });
    }

    if (
        nextAuthFactor?.handler === 'auth.emailConfirmation' &&
        (!user.is_email_confirmation_enabled || !user.confirmed)
    ) {
        return getAuthFactorsParams({ name: 'auth.emailConfirmation', user, authFactors });
    }

    if (
        nextAuthFactor?.handler === 'auth.phoneConfirmation' &&
        user.is_phone_confirmation_enabled &&
        (!user.phone || user.phone === '')
    ) {
        return getAuthFactorsParams({ name: 'auth.phoneConfirmation', user, authFactors });
    }

    return {
        isLast,
        isFirst,
        nextAuthFactor,
    };
}

function clearNextAuthFactors(nextAuthFactor, user) {
    let localnextAuthFactor = { ...nextAuthFactor };

    if (Array.isArray(localnextAuthFactor.handler)) {
        localnextAuthFactor;
    }

    return localnextAuthFactor;
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

            /**
             * For multi page factors
             * name: auth.confirmPhone
             */
            if (typeof name === 'string') {
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
                /**
                 * For one page multifactors
                 * name: { handler: ["user.checkOtp", "auth.confirmPhone"], type: "parallel"}
                 */
            } else {
                if (JSON.stringify(authFactor) === JSON.stringify(name)) {
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

async function factorsMiddleware({ ctx, user, authFactors, nextAuthFactorKey, currentFactor }) {
    const currentAuthFactorParams = getAuthFactorsParams({
        name: currentFactor || ctx.state.route.handler,
        user,
        authFactors,
    });

    await strapi.entityService.update('plugin::users-permissions.user', user.id, {
        data: {
            next_auth_factor_key: null,
            confirmationToken: null,
            phone_confirmation_token: null,
        },
    });

    if (nextAuthFactorKey) {
        if (user.next_auth_factor_key !== nextAuthFactorKey) {
            return ctx.badRequest('Previous auth steps were skipped');
        }

        const handler = currentFactor || ctx.state.route.handler;
        const gotNextAuthFactorPayload = await getService('jwt').verify(nextAuthFactorKey);

        if (Array.isArray(gotNextAuthFactorPayload.nextAuthFactor.handler)) {
            if (!gotNextAuthFactorPayload.nextAuthFactor.handler.includes(handler)) {
                return ctx.badRequest('Wrong Next-Auth-Factor-Key or api hadler');
            }
        } else if (gotNextAuthFactorPayload.nextAuthFactor.handler !== handler) {
            return ctx.badRequest('Wrong Next-Auth-Factor-Key or api hadler');
        }
    }

    if (!nextAuthFactorKey && !currentAuthFactorParams.isFirst) {
        return ctx.badRequest('Previous auth steps were skipped');
    }

    if (currentAuthFactorParams.isLast) {
        return ctx.send({
            jwt: getService('jwt').issue({ id: user.id }),
            user: await sanitizeOutput(user, ctx),
        });
    }

    const newNextAuthFactorKey = getService('jwt').issue({
        nextAuthFactor: currentAuthFactorParams.nextAuthFactor,
    });

    const entity = await strapi.entityService.update('plugin::users-permissions.user', user.id, {
        data: {
            next_auth_factor_key: newNextAuthFactorKey,
        },
    });

    return ctx.send({
        next_auth_factor: currentAuthFactorParams.nextAuthFactor,
        next_auth_factor_key: nextAuthFactorKey,
        user: await sanitizeOutput(entity, ctx),
    });
}

module.exports = {
    getAuthFactorsParams,
    getActionFactorsParams,
    factorsMiddleware,
};
