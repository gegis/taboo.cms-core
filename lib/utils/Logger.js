const bunyan = require('bunyan');
const bformat = require('bunyan-format');
const shortFormat = bformat({ outputMode: 'short' }, process.stdout);

class Logger {
  constructor(config) {
    this.config = config;
    this.logger = {};
    if (config.logger) {
      if (config.debug) {
        config.logger.streams.map(stream => {
          if (stream.stream && stream.stream === process.stdout) {
            stream.level = 'debug';
            stream.stream = shortFormat;
          }
        });
      }
      this.logger = bunyan.createLogger(this.config.logger);
    } else {
      this.logger = {
        log: console.log, // eslint-disable-line no-console
        info: console.info, // eslint-disable-line no-console
        warn: console.warn, // eslint-disable-line no-console
        error: console.error, // eslint-disable-line no-console
        debug: console.debug, // eslint-disable-line no-console
      };
    }
  }

  log(...args) {
    if (args.length < 2) {
      args.unshift('info');
    }
    if (typeof this.logger.log === 'function') {
      this.logger.log(...args);
    } else {
      console.error('Logger method not found: log'); // eslint-disable-line no-console
    }
  }

  info(...args) {
    if (typeof this.logger.info === 'function') {
      this.logger.info(...args);
    } else {
      console.error('Logger method not found: info'); // eslint-disable-line no-console
    }
  }

  warn(...args) {
    if (typeof this.logger.warn === 'function') {
      this.logger.warn(...args);
    } else {
      console.error('Logger method not found: warn'); // eslint-disable-line no-console
    }
  }

  error(...args) {
    if (typeof this.logger.error === 'function') {
      this.logger.error(...args);
    } else {
      console.error('Logger method not found: error'); // eslint-disable-line no-console
    }
  }

  debug(...args) {
    if (typeof this.logger.debug === 'function') {
      this.logger.debug(...args);
    } else {
      console.error('Logger method not found: debug'); // eslint-disable-line no-console
    }
  }
}

// We will need only single instance
module.exports = Logger;
