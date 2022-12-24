function getAuthFactorsParams(name, user) {
    const authFactors = strapi.plugins['users-permissions'].config('authFactors');
    const { isFirst, factorIndex, isLast } = getAuthFactorIndex(name, authFactors);

    let nextAuthFactor = isLast ? undefined : authFactors[factorIndex + 1];

    if (nextAuthFactor === 'user.checkOtp' && !user.is_otp_confirmation_enabled) {
        return getAuthFactorsParams('user.checkOtp', user);
    }

    if (nextAuthFactor === 'auth.emailConfirmation' && !user.is_email_confirmation_enabled) {
        return getAuthFactorsParams('auth.emailConfirmation', user);
    }

    if (
        nextAuthFactor === 'auth.phoneConfirmation' &&
        user.is_phone_number_confirmation_enabled &&
        (!user.phone_numer || user.phone_numer === '')
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
    let isFirst = false;
    let isLast = false;
    let factorIndex = 0;

    for (const [index, authFactor] of authFactors.entries()) {
        if (Array.isArray(authFactor)) {
            authFactor;

            for (const nestedAuthFactor of authFactor) {
                nestedAuthFactor;
                if (nestedAuthFactor === name) {
                    factorIndex = index;

                    if (index === authFactors.length - 1) {
                        isLast = true;
                    }

                    if (index === 0) {
                        isFirst = true;
                    }
                }
            }
        } else {
            isLast = authFactors.indexOf(name) === authFactors.length - 1;
            factorIndex = authFactors.indexOf(name);
            isFirst = authFactors.indexOf(name) === 0;
        }
    }

    return {
        isFirst,
        factorIndex,
        isLast,
    };
}

module.exports = {
    getAuthFactorsParams,
};
