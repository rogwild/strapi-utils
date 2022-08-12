const R = require('ramda');

const undefinedToNull = (x) =>
    Object.keys(x).reduce((p, c) => {
        p[c] = x[c] || null;
        return p;
    }, {});

const nullToUndefined = (x) =>
    Object.keys(x).reduce((p, c) => {
        p[c] = x[c] || undefined;
        return p;
    }, {});

/**
 * Функция для проверки соответствия типов данных
 *
 * @param {any} result - проверяемый объект
 * @param {any} expectation - то, что является референсом
 * @returns {boolean} если вернул true, значит данные соответствуют требуемой структуре
 *
 * Для примера можно запустить этот код:
 * assertTypes(
 *  { lupa: `pupa`, d: 3, a: [{ m: `dffg`, ddffw: 556 }] },
 *  { lupa: `pupa`, d: 2, a: [{ m: `df`, dfd: 2 }] }
 * );
 */
function assertTypes(result, expectation, expKey) {
    result; //?
    expectation; //?
    const results = [];
    const errors = {};

    // Функция для отображения ошибки в консоли
    const logError = (expKey, expectation, result) =>
        console.log(
            `ERROR in assertTypes key '${expKey}' expectation is '${expectation}', but got '${result}'`
        );

    // typeof expectation;

    if (typeof expectation === typeof result) {
        if (typeof expectation === 'object') {
            if (Array.isArray(expectation)) {
                if (expectation.length > 0) {
                    results.push(assertTypes(result[0], expectation[0], expKey));
                }
            } else {
                Object.keys(expectation); //?
                for (const expKey of Object.keys(expectation)) {
                    results.push(assertTypes(result[expKey], expectation[expKey], expKey));
                }
            }
        } else if (typeof expectation === 'string' || typeof expectation === 'number') {
            if (typeof expectation !== typeof result) {
                logError(expKey, expectation, result);
                return false;
            }
            return true;
        }
    } else if (typeof expectation === 'undefined') {
        // if (result === null || result === `undefined`) {
        return true;
        // }
        // logError(expKey, expectation, result);
        // return false;
    } else {
        logError(expKey, expectation, result);
        return false;
    }

    return R.all((x) => x === true, results); //?
}

/**
 * Jest wrapper for hasEqualStructure function
 *
 * @see https://stackoverflow.com/questions/57525643/determine-if-two-objects-have-an-identical-structure-with-jest
 * @example
 * expect.extend({
 *     toMatchStructure,
 * });
 * expect(actual).toMatchObject(expected);
 *
 * @param {Object} actual
 * @param {Object} expected
 * @returns {{ message: () => string, pass: boolean}}
 */
const toMatchObjectTypes = (actual, expected) => {
    const pass = assertTypes(actual, expected);

    return {
        message: () =>
            `expected \n${JSON.stringify(actual, null, 2)} to match structure \n${JSON.stringify(
                expected,
                null,
                2
            )}`,
        pass,
    };
};

module.exports = {
    undefinedToNull,
    nullToUndefined,
    assertTypes,
    toMatchObjectTypes,
};
