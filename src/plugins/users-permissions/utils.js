function getAuthFactorsParams(name, user) {
    console.log('🚀 ~ getAuthFactorsParams ~ user', user);

    const authFactors = strapi.plugins['users-permissions'].config('authFactors');
    let isLast = authFactors.indexOf(name) === authFactors.length - 1;
    let nextAuthFactor = isLast ? undefined : authFactors[authFactors.indexOf(name) + 1];

    if (nextAuthFactor === 'user.checkOtp' && !user.is_otp_confirmation_enabled) {
        return getAuthFactorsParams('user.checkOtp', user);
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
        nextAuthFactor,
    };
}

module.exports = {
    getAuthFactorsParams,
};
