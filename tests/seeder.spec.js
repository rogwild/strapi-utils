const Seeder = require('../src/seeder/Seeder');

beforeAll(() => {});

describe('Seeder', () => {
    it('Seed should read sedds', async () => {
        const seededModelNames = [];

        const seed = new Seeder({ modelName: 'article', apiPath: './tests/api', seededModelNames });
        await seed.setSchema();
        await seed.setSeed();
        await seed.seedEntites();
        seed; //?

        seededModelNames; //?

        expect(4).toEqual(32);
    });
});
