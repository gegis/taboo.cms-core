const striptags = require('striptags');
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
    const { from, nodemailer: { transporter } = {} } = config.mailer;
    this.config = config;
    this.cmsHelper = cmsHelper;
    this.transporter = null;
    this.defaults = {
      from: from,
    };
    this.transporter = nodemailer.createTransport(transporter, this.defaults);
  }

  /**
   * email:
   *  from: '"Fred Foo 👻" <foo@example.com>',
   *  to: "bar@example.com, baz@example.com",
   *  subject: "Hello ✔",
   *  text: "Hello world?",
   *  html: "<i>Hello world?</i>"
   */
  async send(email = {}, { ctx = null, tplPath = null, tplValues = {}, theme = null }) {
    if (!email.to) {
      throw new Error('Please specify options.to');
    }
    const nmEmail = {
      to: email.to,
      subject: email.subject,
    };

    if (email.from) {
      nmEmail.from = email.from;
    }

    if (ctx && tplPath && !email.html) {
      email.html = await this.cmsHelper.composeEmailTemplate(ctx, { tplPath, tplValues, theme });
      if (!email.text) {
        email.text = striptags(email.html);
      }
    }

    this.setEmailBody(nmEmail, email);

    return await this.transporter.sendMail(email);
  }

  setEmailBody(nmEmail, data) {
    if (data.text) {
      nmEmail.text = data.text;
    }
    if (data.html) {
      nmEmail.html = data.html;
    }
    if (!nmEmail.text && nmEmail.html) {
      nmEmail.text = striptags(nmEmail.html);
    }
    if (!nmEmail.html && nmEmail.text) {
      nmEmail.html = nmEmail.text;
    }
  }
}

module.exports = Mailer;
