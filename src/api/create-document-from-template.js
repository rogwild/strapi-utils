const _ = require('lodash');
const htmlToPdf = require('html-pdf-node');
const decode = require('decode-html');

const templateSettings = {
    evaluate: /\{\{(.+?)\}\}/g,
    interpolate: /\{\{=(.+?)\}\}/g,
    escape: /\{\{-(.+?)\}\}/g,
};
const templater = (tmpl) => _.template(tmpl, templateSettings);

async function createDocumentFromTemplate(ctx) {
    const { uid, format = 'html', params, saveFile = false } = ctx;

    const [docTemplate] = await strapi.entityService.findMany('plugin::email-designer.email-template', {
        filters: {
            name: uid,
        },
    });

    let html;

    if (docTemplate) {
        const { bodyHtml } = docTemplate;

        try {
            // console.log('params', params);
            html = templater(decode(bodyHtml))({
                ...params,
            });
        } catch (error) {
            console.log('🚀 ~ createDocumentFromTemplate ~ error', error);
        }
    }

    if (!html) {
        html = createHtml(params);
    }

    if (format === 'html') {
        return html;
    } else if (format === 'pdf') {
        const options = { format: 'A4' };
        const file = { content: html };

        const pdfBuffer = await htmlToPdf.generatePdf(file, options).catch((err) => {
            console.log('generatePdf err', err);
            return ctx.badRequest(err.message);
        });

        if (saveFile) {
            const pdfFileName = `${uid}_${params?.id || Date.now()}}.pdf`;

            const pdfFileMeta = {
                name: pdfFileName,
                type: 'application/pdf',
                size: Buffer.byteLength(pdfBuffer),
                buffer: pdfBuffer,
            };

            const createdFile = await strapi
                .plugin('upload')
                .service('upload')
                .upload({
                    files: pdfFileMeta,
                    data: {},
                })
                .then((res) => res[0]);
        }

        return pdfBuffer;
    }
}

module.exports = createDocumentFromTemplate;

function createHtml(params) {
    let html = '';

    for (const paramKey of Object.keys(params)) {
        if (typeof params[paramKey] === 'object') {
            html += `${paramKey}: <br /> ${createHtml(params[paramKey])}<br /><br />`;
        } else {
            html += `${paramKey}: <br /> ${params[paramKey]}<br /><br />`;
        }
    }

    return html;
}
