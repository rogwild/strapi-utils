function getAuthFactorsParams(name) {
    const authFactors = strapi.plugins['users-permissions'].config('authFactors');
    const isLast = authFactors.indexOf(name) === authFactors.length - 1;
    const nextAuthFactor = isLast ? undefined : authFactors[authFactors.indexOf(name) + 1];

    return {
        isLast,
        nextAuthFactor,
    };
}

module.exports = {
    getAuthFactorsParams,
};
