const _ = require('lodash');

class ApiHelper {
  constructor(config, { logger }) {
    this.config = config;
    this.logger = logger;
  }

  parseRequestParams(requestParams, paramsList) {
    const params = {};
    if (requestParams && _.isObject(requestParams)) {
      this.parseFilter(params, requestParams, paramsList);
      this.parseFields(params, requestParams, paramsList);
      this.parsePageParams(params, requestParams, paramsList);
      this.parseId(params, requestParams, paramsList);
      this.parseSort(params, requestParams, paramsList);
    }

    return params;
  }

  parsePageParams(params, requestParams, paramsList) {
    if (
      [...paramsList].indexOf('page') !== -1 ||
      [...paramsList].indexOf('limit') !== -1 ||
      [...paramsList].indexOf('skip') !== -1
    ) {
      params.limit = this.config.api.defaultPageSize;
      params.skip = 0;
      if (requestParams.limit) {
        params.limit = parseInt(requestParams.limit);
      }
      if (requestParams.skip) {
        params.skip = parseInt(requestParams.skip);
      }
      if (requestParams.page) {
        params.page = parseInt(requestParams.page);
        params.skip = (parseInt(requestParams.page) - 1) * params.limit;
      }
    }
  }

  parseFields(params, requestParams, paramsList) {
    if ([...paramsList].indexOf('fields') !== -1) {
      params.fields = null;
      if (requestParams.fields) {
        params.fields = requestParams.fields;
      }
    }
  }

  parseId(params, requestParams, paramsList) {
    if ([...paramsList].indexOf('id') !== -1) {
      params.id = null;
      if (requestParams.id) {
        params.id = requestParams.id;
      }
    }
  }

  parseFilter(params, requestParams, paramsList) {
    if ([...paramsList].indexOf('filter') !== -1) {
      params.filter = {};
      if (requestParams.filter) {
        try {
          params.filter = JSON.parse(requestParams.filter);
        } catch (e) {
          this.logger.error(e);
        }
      }
    }
  }

  parseSort(params, requestParams, paramsList) {
    if ([...paramsList].indexOf('sort') !== -1) {
      params.sort = null;
      if (requestParams.sort) {
        try {
          params.sort = JSON.parse(requestParams.sort);
        } catch (e) {
          this.logger.error(e);
        }
      }
    }
  }

  cleanTimestamps(data) {
    if (data) {
      if (data.hasOwnProperty('createdAt')) {
        delete data.createdAt;
      }
      if (data.hasOwnProperty('updatedAt')) {
        delete data.updatedAt;
      }
    }
  }
}

module.exports = ApiHelper;
