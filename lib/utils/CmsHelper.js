const path = require('path');
const ejs = require('ejs');

class CmsHelper {
  constructor(config, { app, logger, filesHelper, ejsHelper }) {
    this.config = config;
    this.app = app;
    this.logger = logger;
    this.filesHelper = filesHelper;
    this.ejsHelper = ejsHelper;
    this.isAllowedImplementation = () => {
      this.logger.warn('Requires ACL module implementation');
    };
  }

  getAllModuleNames() {
    return this.filesHelper.getAllDirNames(path.join(this.app.cwd, this.config.server.modulesPath));
  }

  preloadAclResources() {
    const moduleNames = this.getAllModuleNames();
    moduleNames.map(moduleName => {
      const module = {};
      const { modulesPath = null, modules: { configFile = null } = {} } = this.config.server;
      const modulePath = path.join(this.app.cwd, modulesPath, moduleName);
      const moduleConfigPath = path.join(modulePath, configFile);
      module.config = require(moduleConfigPath);
      this.parseAcl(module);
    });
  }

  setupAllModules() {
    const moduleNames = this.getAllModuleNames();
    moduleNames.map(this.getModuleSetup.bind(this));
  }

  getModuleSetup(moduleName) {
    const { modules: modulesConfig } = this.config.server;
    const modulePath = path.join(this.app.cwd, this.config.server.modulesPath, moduleName);
    const moduleConfigPath = path.join(modulePath, this.config.server.modules.configFile);
    const module = {
      name: moduleName,
      path: modulePath,
      config: {
        enabled: false,
        installed: false,
        afterModulesSetup: null,
      },
      controllers: {},
      models: this.filesHelper.getAllFileNames(path.join(modulePath, modulesConfig.modelsDir)),
      services: this.filesHelper.getAllFileNames(path.join(modulePath, modulesConfig.servicesDir)),
      helpers: this.filesHelper.getAllFileNames(path.join(modulePath, modulesConfig.helpersDir)),
    };
    const controllerNames = this.filesHelper.getAllFileNames(path.join(modulePath, modulesConfig.controllersDir));
    try {
      if (this.filesHelper.fileExists(moduleConfigPath)) {
        // Load Module Config
        module.config = require(moduleConfigPath);
        // TODO - installed and enabled does not make much sense now, only that module will not be registered here and no routes created
        if (module.config.installed && module.config.enabled) {
          this.setupControllers(module, controllerNames);
          // If config has afterModulesSetup listener, keep it for later call
          if (module.config && module.config.afterModulesSetup) {
            this.app.afterModulesSetup.push(module.config.afterModulesSetup);
          }
          this.parseAcl(module);
          this.app.modules[moduleName] = module;
        }
      }
    } catch (e) {
      this.logger.error(`Failed to load module '${moduleName}'`);
      this.logger.error(e);
    }
  }

  parseAcl(module) {
    if (module.config && module.config.acl) {
      if (module.config.acl.isAllowedImplementation) {
        this.isAllowedImplementation = module.config.acl.isAllowedImplementation;
      }
      if (module.config.acl.resources) {
        module.config.acl.resources.map(resource => {
          if (this.app.aclResources.indexOf(resource) === -1) {
            this.app.aclResources.push(resource);
          } else {
            throw new Error(`ACL resource '${resource}' is already described, make sure it has a unique name`);
          }
        });
      }
    }
  }

  setupControllers(module, moduleControllers) {
    if (moduleControllers) {
      [...moduleControllers].map(name => {
        const prettyName = name.replace('Controller.', '.').replace('.js', '');
        module.controllers[prettyName] = require(path.join(
          module.path,
          this.config.server.modules.controllersDir,
          name
        ));
      });
    }
  }

  setupPolicies() {
    const policies = this.filesHelper.getAllFileNames(path.join(this.app.cwd, this.config.server.policiesPath));
    if (policies) {
      [...policies].map(policy => {
        try {
          let prettyName = policy.replace('.js', '');
          this.app.policies[prettyName] = require(path.join(this.app.cwd, this.config.server.policiesPath, policy));
        } catch (e) {
          this.logger.error('Error loading policy', e);
        }
      });
    }
  }

  getRouterRouteArgs(route) {
    const args = [];
    args.push(this.getRouteInitialSetup(route));
    this.setupRoutePolicies(args, route);
    args.push(this.getRouteHandler(route));
    return args;
  }

  getRouteInitialSetup(route) {
    return async (ctx, next) => {
      if (ctx.route) {
        ctx.taboo.moduleRoute = route;
        if (route.options && route.options.errorResponseAsJson) {
          ctx.taboo.errorResponseAsJson = true;
        }
        if (route.options && route.options.aclResource) {
          ctx.taboo.aclResource = route.options.aclResource;
        }
      }
      return next();
    };
  }

  setupRoutePolicies(args, route) {
    const { globalPolicies = [] } = this.config.server;
    const { policies = [], options: { disableGlobalPolicies = false } = {} } = route;
    let allPolicies;
    if (disableGlobalPolicies) {
      allPolicies = policies;
    } else {
      allPolicies = globalPolicies.concat(policies);
    }
    if (allPolicies && allPolicies.length > 0) {
      allPolicies.map(policyName => {
        if (this.app.policies[policyName]) {
          args.push(this.app.policies[policyName]);
        }
      });
    }
  }

  getRouteHandler(route) {
    return route.action;
  }

  getModuleModel(module, model) {
    const { modules } = this.app;
    model = model.replace('Model', '');
    if (modules[module] && modules[module].models && modules[module].models[model]) {
      return modules[module].models[model];
    }
    return null;
  }

  getModuleController(module, controller) {
    const { modules } = this.app;
    controller = controller.replace('Controller', '');
    if (modules[module] && modules[module].controllers && modules[module].controllers[controller]) {
      return modules[module].controllers[controller];
    }
    return null;
  }

  getModuleService(module, service) {
    const { modules } = this.app;
    service = service.replace('Service', '');
    if (modules[module] && modules[module].services && modules[module].services[service]) {
      return modules[module].services[service];
    }
    return null;
  }

  getModuleHelper(module, helper) {
    const { modules } = this.app;
    helper = helper.replace('Helper', '');
    if (modules[module] && modules[module].helpers && modules[module].helpers[helper]) {
      return modules[module].helpers[helper];
    }
    return null;
  }

  getPageViewPath(moduleRoute, viewName) {
    const { server } = this.config;
    let pagePath = null;
    let view;

    if (moduleRoute && moduleRoute.action && moduleRoute.action.name && moduleRoute.modulePath) {
      view = `${moduleRoute.action.name.replace('bound ', '')}`;
      if (viewName) {
        view = viewName;
      }
      pagePath = path.join(moduleRoute.modulePath, server.modules.viewsDir, `${view}.${server.templates.extension}`);
      if (!this.filesHelper.fileExists(pagePath)) {
        pagePath = path.join(
          moduleRoute.modulePath,
          server.modules.viewsDir,
          `${server.modules.defaultView}.${server.templates.extension}`
        );
      }
    }

    return pagePath;
  }

  /**
   * @param options - { tplPath = '', theme = defaultTheme }
   * @returns {string}
   */
  getTemplatePath(options) {
    const { server: { templates = {} } = {} } = this.config;
    const { extension, themesPath, defaultTheme, templatesDir } = templates;
    let { tplPath = '', theme } = options;
    if (tplPath.indexOf(`.${extension}`) === -1) {
      tplPath += `.${extension}`;
    }
    if (!theme) {
      theme = defaultTheme;
    }
    return path.join(this.app.cwd, themesPath, theme, templatesDir, tplPath);
  }

  /**
   * @param options - { tplPath = '', theme = defaultTheme }
   * @returns {string}
   */
  getEmailTemplatePath(options) {
    const { server: { templates: { emailsDir = 'emails' } = {} } = {} } = this.config;
    options.tplPath = path.join(emailsDir, options.tplPath);
    return this.getTemplatePath(options);
  }

  /**
   * @param options - { tplPath = '', theme = defaultTheme }
   * @returns {string}
   */
  getErrorTemplatePath(options) {
    const { server: { templates: { errorsDir = 'error' } = {} } = {} } = this.config;
    options.tplPath = path.join(errorsDir, options.tplPath);
    return this.getTemplatePath(options);
  }

  getLayoutPath(theme = null) {
    const { server: { templates: { layoutFile = 'layout', defaultTheme = ' standard' } = {} } = {} } = this.config;
    if (!theme) {
      theme = defaultTheme;
    }
    return this.getTemplatePath({ tplPath: layoutFile, theme });
  }

  async getServerResponse(ctx) {
    const page = await this.getView(ctx.taboo.moduleRoute, ctx.view._view);
    const layout = await this.getLayout(ctx.view._theme);
    return this.composeResponse(ctx, layout, page, ctx.view);
  }

  async getView(moduleRoute, viewName) {
    const pagePath = this.getPageViewPath(moduleRoute, viewName);
    if (pagePath) {
      try {
        return await this.filesHelper.readFile(pagePath);
      } catch (e) {
        this.logger.error(e);
        throw Error('View not found');
      }
    }
  }

  async getTemplate(tplPath, theme = null) {
    const templatePath = this.getTemplatePath({ tplPath, theme });
    try {
      return await this.filesHelper.readFile(templatePath);
    } catch (e) {
      this.logger.error(e);
      throw Error('Layout not found');
    }
  }

  async getEmailTemplate(tplPath, theme = null) {
    const templatePath = this.getEmailTemplatePath({ tplPath, theme });
    try {
      return await this.filesHelper.readFile(templatePath);
    } catch (e) {
      this.logger.error(e);
      throw Error(`Email template '${tplPath}' was not found`);
    }
  }

  async getLayout(theme) {
    const layoutPath = this.getLayoutPath(theme);
    try {
      return await this.filesHelper.readFile(layoutPath);
    } catch (e) {
      this.logger.error(e);
      throw Error('Layout not found');
    }
  }

  async getServerErrorResponse(err, ctx) {
    const page = await this.getErrorPage(err, ctx.view._theme);
    const layout = await this.getErrorLayout(err, ctx, ctx.view._theme);
    return this.composeResponse(ctx, layout, page, {
      error: err.message,
    });
  }

  async getErrorPage(err, theme = null) {
    const { server: { templates } = {} } = this.config;
    let errorPagePath = this.getErrorTemplatePath({ tplPath: templates.defaultErrorView, theme });
    let statusErrorPagePath;
    if (err.status) {
      statusErrorPagePath = this.getErrorTemplatePath({ tplPath: err.status, theme });
      if (this.filesHelper.fileExists(statusErrorPagePath)) {
        errorPagePath = statusErrorPagePath;
      }
    }
    try {
      return await this.filesHelper.readFile(errorPagePath);
    } catch (e) {
      this.logger.error(e);
      return 'Error';
    }
  }

  async getErrorLayout(err, ctx, theme = null) {
    const layoutPath = this.getLayoutPath(theme);
    try {
      return await this.filesHelper.readFile(layoutPath);
    } catch (e) {
      ctx.status = 500;
      ctx.body = e.message;
    }
  }

  composeResponse(ctx, layoutTpl, pageTpl, params) {
    const tplParams = this.getTemplateParams(ctx, params);
    ctx.set('Content-Language', tplParams.locale);
    tplParams._body = ejs.render(pageTpl, tplParams, this.config.server.ejsOptions);
    return ejs.render(layoutTpl, tplParams, this.config.server.ejsOptions);
  }

  getClientConfig(ctx) {
    const { taboo = {} } = ctx;
    return Object.assign(
      {},
      this.config.client,
      {
        env: this.config.environment,
        version: this.config.version,
        debug: this.config.debug,
        locale: taboo.locale,
        language: taboo.language,
        translations: taboo.translations,
        server: {
          port: this.config.server.port,
        },
        sockets: this.config.sockets,
      },
      taboo.clientConfig
    );
  }

  getTemplateParams(ctx, params) {
    const { taboo = {} } = ctx;
    const { version, environment, debug, client } = this.config;
    const clientConfig = this.getClientConfig(ctx);
    let viewParams = Object.assign(
      {
        _clientConfig: clientConfig,
        _clientConfigJson: JSON.stringify(clientConfig),
        _version: version,
        _env: environment,
        _debug: debug,
        metaTitle: client.metaTitle,
        language: taboo.language,
        locale: taboo.locale,
        translations: taboo.translations,
        flashMessages: ctx.flashMessages,
      },
      params
    );
    return Object.assign(viewParams, {
      helpers: this.ejsHelper.getAllHelpers(viewParams),
    });
  }

  setDefaultLanguageParams(ctx) {
    const { i18n } = this.config;
    ctx.taboo.language = i18n.defaultLanguage;
    ctx.taboo.locale = i18n.defaultLocale;
    ctx.taboo.translations = {};
    if (this.app.locales[ctx.taboo.locale]) {
      ctx.taboo.translations = this.app.locales[ctx.taboo.locale];
    }
  }

  setDefaultAdminLanguageParams(ctx) {
    const {
      i18n: { admin: i18nAdmin = {} },
    } = this.config;
    ctx.taboo.adminLanguage = i18nAdmin.defaultLanguage;
    ctx.taboo.adminLocale = i18nAdmin.defaultLocale;
    ctx.taboo.adminTranslations = {};
    if (this.app.adminLocales[ctx.taboo.adminLocale]) {
      ctx.taboo.adminTranslations = this.app.adminLocales[ctx.taboo.adminLocale];
    }
  }

  loadLocales(localesPath, localesNamespace = 'locales') {
    const allLocales = this.filesHelper.getAllFileNames(localesPath);
    if (allLocales) {
      [...allLocales].map(locale => {
        if (locale && locale.indexOf('.js') !== -1) {
          const localeName = locale.replace('.js', '');
          const localePath = path.join(this.app.cwd, localesPath, locale);
          try {
            this.app[localesNamespace][localeName] = require(localePath);
          } catch (e) {
            this.logger.error(e);
          }
        }
      });
    }
  }

  getLocalesArray(admin = false) {
    const helper = {};
    const locales = [];
    const localesArray = [];
    const appLocales = admin ? this.app.adminLocales : this.app.locales;
    let item;
    for (let locale in appLocales) {
      if (locales.indexOf(locale) === -1) {
        locales.push(locale);
      }
      for (let key in appLocales[locale]) {
        if (!helper.hasOwnProperty(key)) {
          helper[key] = {};
        }
        helper[key][locale] = appLocales[locale][key];
      }
    }

    for (let key in helper) {
      item = {};
      item.key = key;
      locales.map(locale => {
        item[locale] = appLocales[locale][key];
      });
      localesArray.push(item);
    }

    return localesArray;
  }

  composeTemplate(ctx, tpl, params) {
    const tplParams = this.getTemplateParams(ctx, params);
    return ejs.render(tpl, tplParams, this.config.server.ejsOptions);
  }

  async composeEmailTemplate(ctx, tplPath, tplValues = null) {
    let tpl = null;
    try {
      if (tplPath) {
        tpl = await this.getEmailTemplate(tplPath);
        if (tplValues) {
          tpl = this.composeTemplate(ctx, tpl, tplValues);
        }
      }
    } catch (e) {
      this.logger.error(e);
      throw e;
    }
    return tpl;
  }

  isAllowed(subject, resource) {
    return this.isAllowedImplementation(subject, resource);
  }
}

module.exports = CmsHelper;
