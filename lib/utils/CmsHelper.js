const path = require('path');
const ejs = require('ejs');
const _ = require('lodash');

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
        beforeTemplateRender: null,
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
          // If config has beforeTemplateRender listener, keep it for later call
          if (module.config && module.config.beforeTemplateRender) {
            this.app.beforeTemplateRender.push(module.config.beforeTemplateRender);
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
        ctx.routeParams.moduleRoute = route;
        ctx.routeParams.errorResponseAsJson = !!(route.options && route.options.errorResponseAsJson);
        ctx.routeParams.aclResource = route.options && route.options.aclResource ? route.options.aclResource : null;
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
    if (typeof options.tplPath === 'number') {
      options.tplPath = options.tplPath.toString();
    }
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
    const page = await this.getView(ctx.routeParams.moduleRoute, ctx.viewParams._view);
    const layout = await this.getLayout(ctx.viewParams._template);
    return await this.composeResponse(ctx, layout, page, ctx.viewParams);
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
      throw Error(`Theme ${theme} layout not found`);
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
      throw Error(`Theme ${theme} layout not found`);
    }
  }

  async getServerErrorResponse(err, ctx) {
    const page = await this.getErrorPage(err, ctx.viewParams._template);
    const layout = await this.getErrorLayout(err, ctx, ctx.viewParams._template);
    return await this.composeResponse(ctx, layout, page, {
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

  async composeResponse(ctx, layoutTpl, pageTpl, params) {
    await this.onBeforeTemplateRender(ctx, pageTpl, params);
    let tplParams = this.getTemplateParams(ctx, params);
    ctx.set('Content-Language', tplParams.locale);
    tplParams._body = ejs.render(pageTpl, tplParams, this.config.server.ejsOptions);
    return ejs.render(layoutTpl, tplParams, this.config.server.ejsOptions);
  }

  async composeTemplate(ctx, tpl, params) {
    await this.onBeforeTemplateRender(ctx, tpl, params);
    let tplParams = this.getTemplateParams(ctx, params);
    return ejs.render(tpl, tplParams, this.config.server.ejsOptions);
  }

  async onBeforeTemplateRender(ctx, tpl, params) {
    const { beforeTemplateRender = [] } = this.app;
    let promises = [];
    let promisesData = [];
    if (beforeTemplateRender && beforeTemplateRender.length > 0) {
      for (let i = 0; i < beforeTemplateRender.length; i++) {
        if (typeof beforeTemplateRender[i] === 'function') {
          promises.push(beforeTemplateRender[i](ctx, tpl, params));
        }
      }
      promisesData = await Promise.all(promises);
      if (promisesData) {
        for (let i = 0; i < promisesData.length; i++) {
          if (typeof promisesData[i] === 'object') {
            Object.assign(params, promisesData[i]);
          }
        }
      }
    }
  }

  async composeEmailTemplate(ctx, { tplPath = '', tplValues = null, theme = null }) {
    let tpl = null;
    try {
      if (tplPath) {
        tpl = await this.getEmailTemplate(tplPath, theme);
        if (tplValues) {
          tpl = await this.composeTemplate(ctx, tpl, tplValues);
        }
      }
    } catch (e) {
      this.logger.error(e);
      throw e;
    }
    return tpl;
  }

  composeClientConfig(ctx) {
    const { routeParams = {} } = ctx;
    const { version, environment, debug, server = {}, sockets } = this.config;
    return _.merge(
      {},
      this.config.client,
      {
        env: environment,
        version: version,
        debug: debug,
        locale: routeParams.locale,
        language: routeParams.language,
        translations: routeParams.translations,
        server: {
          port: server.port,
        },
        sockets: sockets,
      },
      routeParams.clientConfig
    );
  }

  getTemplateParams(ctx, params) {
    const { routeParams = {} } = ctx;
    const { version, environment, debug, client } = this.config;
    const clientConfig = this.composeClientConfig(ctx);
    let viewParams = Object.assign(
      {
        _clientConfig: clientConfig,
        _version: version,
        _env: environment,
        _debug: debug,
        metaTitle: client.metaTitle,
        language: routeParams.language,
        locale: routeParams.locale,
        translations: routeParams.translations,
        flashMessages: ctx.flashMessages,
      },
      params
    );
    return Object.assign(viewParams, {
      helpers: this.ejsHelper.getAllHelpers(viewParams),
    });
  }

  getDefaultLanguageParams(namespace = 'client') {
    const { i18n } = this.config;
    const languageParams = {
      language: i18n.defaultLanguage,
      locale: i18n.defaultLocale,
      localesMapping: i18n.defaultLocalesMapping,
    };
    if (namespace === 'admin') {
      languageParams.language = i18n.admin.defaultLanguage;
      languageParams.locale = i18n.admin.defaultLocale;
      languageParams.localesMapping = i18n.admin.defaultLocalesMapping;
    }
    return languageParams;
  }

  getLanguageByLocale(locale, localesMapping) {
    let language = null;
    for (let key in localesMapping) {
      if (localesMapping[key] === locale) {
        language = key;
      }
    }
    return language;
  }

  setLanguage(ctx, namespace, { language = null, locale = null, customTranslations = {} }) {
    const { routeParams } = ctx;
    const defaultLanguageParams = this.getDefaultLanguageParams(namespace);
    const allTranslations = this.getFileTranslations(namespace);
    let translations = {};

    if (locale) {
      routeParams.locale = locale;
      routeParams.language = this.getLanguageByLocale(locale, defaultLanguageParams.localesMapping);
    } else if (language) {
      routeParams.language = language;
      routeParams.locale = defaultLanguageParams.localesMapping[language];
    } else {
      routeParams.language = defaultLanguageParams.language;
      routeParams.locale = defaultLanguageParams.locale;
    }

    if (allTranslations[routeParams.locale]) {
      Object.assign(translations, allTranslations[routeParams.locale]);
    }

    Object.assign(translations, customTranslations);

    routeParams.translations = translations;
  }

  loadFileTranslations(localesPath, namespace = 'client') {
    const allFiles = this.filesHelper.getAllFileNames(localesPath);
    if (allFiles) {
      [...allFiles].map(locale => {
        if (locale && locale.indexOf('.js') !== -1) {
          const localeName = locale.replace('.js', '');
          const localePath = path.join(this.app.cwd, localesPath, locale);
          try {
            if (!this.app.translations[namespace]) {
              this.app.translations[namespace] = {};
            }
            this.app.translations[namespace][localeName] = require(localePath);
          } catch (e) {
            this.logger.error(e);
          }
        }
      });
    }
  }

  getFileTranslations(namespace = 'client') {
    if (this.app.translations[namespace]) {
      return this.app.translations[namespace];
    }
    return this.app.translations;
  }

  getFileTranslationsAsArray(namespace = 'client') {
    const helper = {};
    const locales = [];
    const localesArray = [];
    const fileTranslations = this.app.translations[namespace];
    let item;
    for (let locale in fileTranslations) {
      if (locales.indexOf(locale) === -1) {
        locales.push(locale);
      }
      for (let key in fileTranslations[locale]) {
        if (!helper.hasOwnProperty(key)) {
          helper[key] = {};
        }
        helper[key][locale] = fileTranslations[locale][key];
      }
    }

    for (let key in helper) {
      item = {};
      item.key = key;
      locales.map(locale => {
        item[locale] = fileTranslations[locale][key];
      });
      localesArray.push(item);
    }

    return localesArray;
  }

  isAllowed(subject, resource) {
    return this.isAllowedImplementation(subject, resource);
  }
}

module.exports = CmsHelper;
