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
  constructor(config, { cmsHelper }) {
    const {
      from,
      nodemailer: { transporter },
    } = config.mailer;
    this.config = config;
    this.cmsHelper = cmsHelper;
    this.transporter = null;
    this.defaults = {
      from: from,
    };
    this.transporter = nodemailer.createTransport(transporter, this.defaults);
  }

  /**
   * options:
   *  from: '"Fred Foo 👻" <foo@example.com>',
   *  to: "bar@example.com, baz@example.com",
   *  subject: "Hello ✔",
   *  text: "Hello world?",
   *  html: "<i>Hello world?</i>"
   */
  async send(options = {}, ctx = null, tplName = null, tplValues = {}) {
    if (!options.to) {
      throw new Error('Please specify options.to');
    }
    if (ctx && tplName) {
      options.html = await this.cmsHelper.composeEmailTemplate(ctx, tplName, tplValues);
      if (!options.text) {
        options.text = options.html;
      }
    }
    return await this.transporter.sendMail(options);
  }
}

module.exports = Mailer;
