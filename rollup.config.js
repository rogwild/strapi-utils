/**
 * For more info
 * see https://blog.logrocket.com/the-complete-guide-to-publishing-a-react-package-to-npm/
 */

import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import jsonPlugin from '@rollup/plugin-json';
import { babel } from '@rollup/plugin-babel';
import pkg from './package.json';

export default {
    input: 'index.js',
    output: [
        {
            file: pkg.main,
            format: 'cjs',
            exports: 'named',
            sourcemap: true,
            strict: false,
        },
    ],
    plugins: [
        resolve(),
        // babel({
        //     babelrc: false,
        //     presets: [
        //         [
        //             '@babel/env',
        //             {
        //                 targets: {
        //                     node: 'current',
        //                 },
        //             },
        //         ],
        //     ],
        //     plugins: [],
        // }),
        commonjs(),
        jsonPlugin(),
    ],
    external: [
        '@strapi/strapi',
        '@strapi/plugin-i18n',
        '@strapi/plugin-users-permissions',
        'nodemailer',
        'lodash',
        'axios',
        'sendpulse-api',
    ],
};
