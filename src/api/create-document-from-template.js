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
    const { uid, format = 'html', params } = ctx;

    const [docTemplate] = await strapi.entityService.findMany('plugin::email-designer.email-template', {
        filters: {
            name: uid,
        },
    });

    if (!docTemplate) {
        return ctx.badRequest('Template is not found');
    }

    const { bodyHtml } = docTemplate;
    const date = new Date().toLocaleDateString('ru-RU', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    });

    // console.log('params', params);
    const html = templater(decode(bodyHtml))({
        DATE: date,
        ...params,
    });

    if (format === 'html') {
        return html;
    } else if (format === 'pdf') {
        const options = { format: 'A4' };
        const file = { content: html };

        return htmlToPdf.generatePdf(file, options).catch((err) => {
            console.log('generatePdf err', err);
            return ctx.badRequest(err.message);
        });
    }
}

module.exports = createDocumentFromTemplate;
