module.exports = function (wallaby) {
    return {
        autoDetect: true,
        runMode: 'onsave',
        env: {
            type: 'node',
        },
    };
};
