const Seeder = require('../src/seeder/Seeder');

describe('Seeder', () => {
    it('Seed should read sedds', async () => {
        const seed = new Seeder({ modelName: 'article', apiPath: './tests/api' });
        await seed.setSchema();
        await seed.setSeed();
        await seed.seedEntites();
        seed; //?

        expect(4).toEqual(32);
    });
});
