global.strapi = {
    entityService: {
        findMany: () => {
            return [];
        },
        crete: () => {
            return {};
        },
    },
    plugin: () => {
        return {
            service: () => {
                return {
                    upload: async () => {
                        return {};
                    },
                };
            },
        };
    },
};
