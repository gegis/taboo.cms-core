const Koa = require('koa');
const Router = require('koa-better-router');
const koaBody = require('koa-body');
const http = require('http');
const KeyGrip = require('keygrip');
const koaSession = require('koa-session');
const koaPassport = require('koa-passport');
const cors = require('koa-cors');
const _ = require('lodash');
const serve = require('koa-static');
const config = require('./config');
const Logger = require('./utils/Logger');
const CmsHelper = require('./utils/CmsHelper');
const FilesHelper = require('./utils/FilesHelper');
const EjsHelper = require('./utils/EjsHelper');
const ApiHelper = require('./utils/ApiHelper');
const ArrayHelper = require('./utils/ArrayHelper');
const EventsEmitter = require('./utils/EventsEmitter');
const Mailer = require('./utils/Mailer');
const SocketsServer = require('./utils/SocketsServer');

class CmsCore {
  constructor() {
    this.loading = false;
    this.running = false;
    this.app = {
      cwd: process.cwd(),
      routes: [],
      modules: {},
      policies: {},
      dbConnections: {},
      locales: {},
      adminLocales: {},
      server: null,
      afterModulesSetup: [], // Registered functions from each module config to be called after all modules setup
      aclResources: [],
    };
    this.config = config;
    this.logger = new Logger(config);
    this.events = new EventsEmitter(config);
    this.arrayHelper = new ArrayHelper();
    this.filesHelper = new FilesHelper(config);
    this.apiHelper = new ApiHelper(config, { logger: this.logger });
    this.ejsHelper = new EjsHelper(config, { logger: this.logger });
    this.cmsHelper = new CmsHelper(config, {
      app: this.app,
      logger: this.logger,
      filesHelper: this.filesHelper,
      ejsHelper: this.ejsHelper,
    });
    this.mailer = new Mailer(config, {
      filesHelper: this.filesHelper,
      ejsHelper: this.ejsHelper,
      cmsHelper: this.cmsHelper,
    });
    this.sockets = new SocketsServer(config, { logger: this.logger, events: this.events }); //sockets server
    this.koaApp = new Koa();
    this.router = Router().loadMethods();
    this.passport = null;
    this.start = this.start.bind(this);
  }

  async start(customMiddlewareSetup) {
    // TODO investigate jwt
    if (this.running) {
      this.logger.error('Taboo Cms Core is already running');
    } else if (this.loading) {
      this.logger.error('Taboo Cms Core is loading');
    } else {
      this.loading = true;
      // The order below is important
      this.setupOnServerError();
      this.setupServerSecretKeys();
      this.setupStaticFiles();
      this.loadLocales();
      await this.setupDb();
      this.setupMiddleware(customMiddlewareSetup);
      this.setupSession();
      // Setup passport after session
      this.setupPassport();
      this.setupPolicies();
      await this.setupAppModules();
      this.setupServerResponse();
      await this.startServer();
      this.startSocketsServer();
      this.loading = false;
      this.running = true;
    }
    return this.app;
  }

  setupServerSecretKeys() {
    this.koaApp.keys = new KeyGrip(this.config.server.secretKeys, 'sha256');
  }

  setupOnServerError() {
    const { silentErrors } = this.config.server;
    this.koaApp.on('error', (err, ctx) => {
      if (silentErrors.indexOf(err.name) === -1) {
        this.logger.error('Server error:');
        // Keep this whole ctx debug only for production to have more details to collect
        if (['production'].indexOf(this.config.environment) !== -1) {
          this.logger.error(ctx);
        } else if (this.config.debug && ctx.taboo) {
          this.logger.debug(ctx.taboo.moduleRoute);
        }
        this.logger.error(err);
      }
    });

    this.koaApp.use(async (ctx, next) => {
      let errorResponse;
      try {
        await next();
      } catch (err) {
        ctx.status = err.status || 500;
        if (ctx.taboo && ctx.taboo.errorResponseAsJson) {
          errorResponse = {
            error: err,
            message: err.message,
          };
        } else {
          errorResponse = await this.cmsHelper.getServerErrorResponse(err, ctx);
        }
        ctx.body = errorResponse;
        ctx.app.emit('error', err, ctx);
      }
    });
  }

  setupStaticFiles() {
    const {
      publicDir,
      uploads: { serveStaticDir = null },
    } = this.config.server;

    this.koaApp.use(serve(publicDir));

    if (serveStaticDir && publicDir !== serveStaticDir) {
      this.koaApp.use(serve(serveStaticDir));
    }
  }

  loadLocales() {
    const { localesDir, adminLocalesDir } = this.config.server;
    this.cmsHelper.loadLocales(localesDir);
    this.cmsHelper.loadLocales(adminLocalesDir, 'adminLocales');
  }

  setupMiddleware(customMiddlewareSetup) {
    const {
      cors: { enabled: corsEnabled = false, options: corsOptions },
      uploads: { maxFileSize },
    } = this.config.server;
    // Setup taboo and view objects on ctx object
    this.koaApp.use(async (ctx, next) => {
      ctx.view = {}; // template view, layout and view variables
      ctx.flashMessages = []; // flash messages for views
      ctx.taboo = {}; // taboo cms related configuration
      ctx.taboo.clientConfig = {}; // any dynamic overrides for template default config.client
      this.cmsHelper.setDefaultLanguageParams(ctx);
      this.cmsHelper.setDefaultAdminLanguageParams(ctx);
      await next();
    });

    if (corsEnabled) {
      this.koaApp.use(cors(corsOptions));
    }

    // Body parser
    this.koaApp.use(
      koaBody({
        multipart: true,
        formidable: {
          maxFileSize: maxFileSize,
        },
      })
    );

    if (customMiddlewareSetup && _.isFunction(customMiddlewareSetup)) {
      customMiddlewareSetup(this.koaApp, this.config);
    }

    // Log incoming requests and times only for debug and development envs
    if (this.config.debug) {
      this.koaApp.use(async (ctx, next) => {
        const start = Date.now();
        await next();
        const ms = Date.now() - start;
        this.logger.info(`${ctx.method} ${ctx.url} - ${ms} ms`);
      });
    }
  }

  async setupDb() {
    const adapterMethods = {
      connect: 'connect() - method to connect to DB method which is either async or returns a Promise',
      getConnection: 'getConnection() - method to return existing connection',
      getConnectionName: 'getConnectionName() - method to get connection name',
      setupModel: 'setupModel() - method to setup model',
    };
    const { connections } = this.config.db;
    let name, config;

    for (name in connections) {
      if (connections.hasOwnProperty(name)) {
        config = connections[name];
        if (config.adapter) {
          // Set DB Adapter
          this.app.dbConnections[name] = config.adapter;

          // Validate Adapter methods
          _.each(adapterMethods, (sample, method) => {
            if (!this.app.dbConnections[name][method] || !_.isFunction(this.app.dbConnections[name][method])) {
              throw Error(`Connection '${name}' adapter must implement ${sample}`);
            }
          });

          // Connect to DB
          await this.app.dbConnections[name].connect(config);

          this.logger.info(
            `Successfully established '${name}' connection: ${this.app.dbConnections[name].getConnectionName()}`
          );
        }
      }
    }
  }

  async setupAppModules() {
    const { modules, afterModulesSetup } = this.app;
    let promises;
    // Read and parse all modules with configs
    this.cmsHelper.setupAllModules();
    // Bind routes to controllers methods
    this.setupRoutes();
    // Call all afterModulesSetup listeners if any of modules had it
    promises = afterModulesSetup.map(fn => {
      fn(modules, this.app.aclResources);
    });
    await Promise.all(promises);
  }

  setupSession() {
    const customStoreMethods = {
      get: 'get(key)',
      set: 'set(key, value, maxAge, options)',
      destroy: 'destroy(key)',
    };
    const { session } = this.config.server;
    let module;
    // TODO implement custom session.options.encode and session.options.decode methods
    if (session.store && session.store !== 'cookie') {
      try {
        module = require(session.store);
        session.options.store = new module(session.options);
        _.each(customStoreMethods, (sample, method) => {
          if (!session.options.store[method] || !_.isFunction(session.options.store[method])) {
            throw Error(`Session must implement ${sample} method`);
          }
        });
      } catch (e) {
        this.logger.error(e);
      }
    }
    this.koaApp.use(koaSession(session.options, this.koaApp));
  }

  setupPassport() {
    const { passport } = this.config;
    if (passport.setupStrategiesMethod && _.size(passport.strategies) > 0) {
      this.passport = koaPassport;
      passport.setupStrategiesMethod(this.passport, this.config);
      this.koaApp.use(this.passport.initialize());
      this.koaApp.use(this.passport.session());
    }
  }

  setupPolicies() {
    this.cmsHelper.setupPolicies();
  }

  setupRoutes() {
    const { modules } = this.app;
    let allRouteMethods = [];
    let allRoutes = [];
    let moduleName, module, methodAndPath;
    for (moduleName in modules) {
      if (modules.hasOwnProperty(moduleName)) {
        module = modules[moduleName];
        const { routes = [] } = module.config;
        routes.map(route => {
          if (!route.order) {
            route.order = 0;
          }
          route.modulePath = module.path;
          methodAndPath = `${route.method}:${route.path}`;
          if (this.config.environment !== 'production' && allRouteMethods.indexOf(methodAndPath) !== -1) {
            this.logger.error(
              `Route with the following method '${route.method}' and path '${route.path}' already exists, please check the following route: \n`,
              route
            );
          }
          allRoutes.push(route);
          allRouteMethods.push(methodAndPath);
        });
      }
    }
    this.app.routes = this.arrayHelper.sortByProperty(allRoutes, 'order');
    this.app.routes.map(route => {
      this.router[route.method.toLowerCase()](route.path, this.cmsHelper.getRouterRouteArgs(route));
    });
    this.koaApp.use(this.router.middleware());
  }

  startServer() {
    return new Promise(resolve => {
      this.app.server = http.createServer(this.koaApp.callback()).listen(this.config.server.port, () => {
        this.logger.info(`Server is listening on port ${this.config.server.port}`);
        this.events.emit('server-started', this.koaApp);
        resolve(this.koaApp);
      });
    });
  }

  setupServerResponse() {
    this.koaApp.use(async (ctx, next) => {
      if (ctx.err) {
        ctx.throw(500, ctx.err);
      } else if (ctx.route && !ctx.body) {
        return (ctx.body = await this.cmsHelper.getServerResponse(ctx));
      } else {
        await next();
      }
    });
  }

  startSocketsServer() {
    if (this.config.sockets.enabled) {
      this.sockets.start(this.app.server, { logger: this.logger, events: this.events });
    }
  }
}

const cmsCore = new CmsCore();

module.exports = {
  _: _,
  start: cmsCore.start,
  cwd: cmsCore.app.cwd,
  config: cmsCore.config,
  app: cmsCore.app,
  modules: cmsCore.app.modules,
  logger: cmsCore.logger,
  arrayHelper: cmsCore.arrayHelper,
  filesHelper: cmsCore.filesHelper,
  apiHelper: cmsCore.apiHelper,
  ejsHelper: cmsCore.ejsHelper,
  cmsHelper: cmsCore.cmsHelper,
  mailer: cmsCore.mailer,
  sockets: cmsCore.sockets,
  events: cmsCore.events,
  koaApp: cmsCore.koaApp,
  router: cmsCore.router,
  passport: cmsCore.passport,
  Model: moduleModel => {
    const params = moduleModel.split('.');
    if (params.length !== 2) {
      throw new Error('Please specify module and model: "module.Model"');
    }
    return cmsCore.cmsHelper.getModuleModel(...params);
  },
  Service: moduleService => {
    const params = moduleService.split('.');
    if (params.length !== 2) {
      throw new Error('Please specify module and service: "module.Service"');
    }
    return cmsCore.cmsHelper.getModuleService(...params);
  },
  Helper: moduleHelper => {
    const params = moduleHelper.split('.');
    if (params.length !== 2) {
      throw new Error('Please specify module and helper: "module.Helper"');
    }
    return cmsCore.cmsHelper.getModuleHelper(...params);
  },
  isAllowed(subject, resource) {
    return cmsCore.cmsHelper.isAllowed(subject, resource);
  },
};
