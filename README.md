# Taboo CMS Core

## Documentation
This is a core library for [Taboo CMS](https://www.npmjs.com/package/@taboo/cms).

[@taboo/cms](https://www.npmjs.com/package/@taboo/cms) uses this module to bootstrap the application.

Available exports from this module:
```
_                    - lodash
start                - to start and bootstrap the server and other utils
cwd                  - current working directory
config               - merged application config
app                  - app related attributes
modules              - all the bootsrtapped modules from ./app/modules
logger               - logger function, logger.info('Info'),
                       logger.warn('Warn'), logger.error('Error')
arrayHelper          - helper for array manipulations
filesHelper          - helper for file system manipulations
apiHelper            - helper for api related functions
ejsHelper            - server side templating helper, it uses ejs 
                       templates
cmsHelper            - cms related (mostly koa.js and variation between 
                       apiHelper and filesHelper logic)
mailer               - node mailer to send emails
sockets              - sockets server io to emit/receive messages
events               - events receiver/emitter
koaApp               - bootsrapped koa app
router               - koa router
passport             - authentication passport
loadFileTranslations - loads all app translations from locales files
getFileTranslations  - returns loaded translations from locales files
setLanguage          - sets application language and loads correct 
                       translations
getAclResources      - returns (preloads if needed) acl resources
isAllowed            - implementation of ACL based logic to get if
                       resource is allowed.
getFileTranslationsAsArray - returns all translations as single array
                              of objects
```

To start the server from your own app:
```
const { start, logger } = require('@taboo/cms-core');

start().catch(error => {
  logger.error(error);
});
```

It will bootstrap application from the following app structure:
```
app
    locales
    modules
        module1
            controllers
            helpers
            models
            services
            ui
                compontents
                    admin
                stores
                helpers
                styles
                    admin
                        index.less
                    index.less
                admin.config.js
                app.config.js
            views
            module.config.js
    policies
    themes
        admin
        blank
        standard
            assets
                fonts
                images
                styles
            templates
                emails
                layout.ejs
            ui
                components
                    admin
                        Settings.jsx
                    Templates.jsx
                config.js
                preview.png
bin
config
    environment
        development.js
        production.js
        staging.js
    custom.js
    index.js
    local.js
data
logs
node_modules
public
scripts
tasks
apidoc.json
gulpfile.js
index.js
package.json
package-lock.json
pm2.json
webpack.config.js
```

Or simply just use this already built CMS:
[@taboo/cms](https://www.npmjs.com/package/@taboo/cms)


## CTX custom properties
```
// ctx.flashMessages
[
  {
    message: 'Your message',
    type: 'error',
  }
]

// ctx.routeParams
{ 
  clientConfig: {},
  language: 'en',
  locale: 'en-gb',
  translations: {},
  moduleRoute: {
    method: 'GET',
    path: '/',
    action: [AsyncFunction: index],
    policies: [ 'isAuthenticated', 'i18n' ],
    order: 0,
    options: {
        errorResponseAsJson: true,
        aclResource: 'admin.pages.manage',
    },
    modulePath: '/absolute/path/app/modules/main',
  },
  errorResponseAsJson: true,
  aclResource: 'admin.pages.manage',
}

// ctx.viewParams
{
  _template: 'standard',
  _view: 'index',
  // ... all of your custom values to be used in the view
}

// template params
{
  _clientConfig: {
    env: 'development',
    version: '2.1.3',
    debug: true,
    metaTitle: 'Taboo CMS',
    language: 'en',
    locale: 'en-gb',
    translations: {},
    admin: { language: 'en', locale: 'en-gb' },
    languages: [ ],
    server: { port: 3000 },
    sockets: { enabled: true, port: null, path: '/socket.io', rooms: [Array] },
    dateFormat: 'DD/MM/YYYY',
    dateTimeFormat: 'DD/MM/YYYY HH:mm:ss',
    // ... all of your custom values to be used in the view
  },
  _version: '2.1.3',
  _env: 'development',
  _debug: true,
  metaTitle: 'Taboo CMS',
  language: 'en',
  locale: 'en-gb',
  translations: {},
  flashMessages: [],
  _template: 'standard',
  _view: 'index',
  helpers: {
    href: [Function: href],
    linkPrefix: [Function: linkPrefix],
    translate: [Function: translate],
    _data: [Circular],
    _translateText: [Function: bound _translateText]
  },
}
```

