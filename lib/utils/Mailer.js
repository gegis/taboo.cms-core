const path = require('path');
const ejs = require('ejs');
const nodemailer = require('nodemailer');

/**
 * Transport example
 * {
 *   host: 'smtp.ethereal.email',
 *   port: 587,
 *   secure: false, // true for 465, false for other ports
 *   auth: {
 *     user: account.user, // generated ethereal user
 *     pass: account.pass, // generated ethereal password
 *   },
 * }
 */
class Mailer {
  constructor(config, { filesHelper, ejsHelper, cmsHelper }) {
    const {
      from,
      nodemailer: { transporter },
    } = config.mailer;
    this.config = config;
    this.filesHelper = filesHelper;
    this.ejsHelper = ejsHelper;
    this.cmsHelper = cmsHelper;
    this.transporter = null;
    this.defaults = {
      from: from,
    };
    this.transporter = nodemailer.createTransport(transporter, this.defaults);
  }

  /**
   * from: '"Fred Foo 👻" <foo@example.com>',
   * to: "bar@example.com, baz@example.com",
   * subject: "Hello ✔",
   * text: "Hello world?",
   * html: "<i>Hello world?</i>"
   * ctx: {} - if your tpl needs variables and translations
   */
  async send(options = {}, tplName = null, tplValues = {}) {
    let tpl, tplConfig, tplParams;
    if (!options.to) {
      throw new Error('Please specify options.to');
    }
    if (tplName) {
      tpl = await this.getEmailTemplate(tplName);
      if (tpl) {
        tplParams = this.getTemplateParams(options.ctx, tplValues);
        tplConfig = Object.assign(tplParams, {
          helpers: this.ejsHelper.getAllHelpers(tplParams),
        });
        options.html = ejs.render(tpl, tplConfig, this.config.server.ejsOptions);
        if (!options.text) {
          options.text = options.html;
        }
      }
    }
    return await this.transporter.sendMail(options);
  }

  getTemplateParams(ctx = {}, tplValues) {
    const { taboo = {} } = ctx;
    const clientConfig = this.cmsHelper.getClientConfig(ctx);
    return Object.assign(
      {
        _clientConfig: clientConfig,
        _clientConfigJson: JSON.stringify(clientConfig),
        _version: this.config.version,
        _env: this.config.environment,
        _debug: this.config.debug,
        pageTitle: this.config.server.views.defaultPageTitle,
        language: taboo.language,
        locale: taboo.locale,
        translations: taboo.translations,
        flashMessages: ctx.flashMessages,
      },
      tplValues
    );
  }

  async getEmailTemplate(tplName = null) {
    const {
      emailTemplatesDir = null,
      views: { extension = 'html' },
    } = this.config.server;
    let tplPath;
    let tpl = null;

    if (tplName && emailTemplatesDir) {
      if (tplName.indexOf('.') === -1) {
        tplName += `.${extension}`;
      }
      tplPath = path.resolve(emailTemplatesDir, tplName);
      if (this.filesHelper.fileExists(tplPath)) {
        tpl = await this.filesHelper.readFile(tplPath);
      } else {
        throw new Error(`Email template '${tplPath}' was not found`);
      }
    }
    return tpl;
  }
}

module.exports = Mailer;
