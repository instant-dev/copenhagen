const https = require('https');

const NATIVE_MODULES = [
  'internal/bootstrap_node',
  'async_hooks',
  'assert',
  'buffer',
  'child_process',
  'console',
  'constants',
  'crypto',
  'cluster',
  'dgram',
  'dns',
  'domain',
  'events',
  'fs',
  'http',
  'http2',
  '_http_agent',
  '_http_client',
  '_http_common',
  '_http_incoming',
  '_http_outgoing',
  '_http_server',
  'https',
  'inspector',
  'module',
  'net',
  'os',
  'path',
  'perf_hooks',
  'process',
  'punycode',
  'querystring',
  'readline',
  'repl',
  'stream',
  '_stream_readable',
  '_stream_writable',
  '_stream_duplex',
  '_stream_transform',
  '_stream_passthrough',
  '_stream_wrap',
  'string_decoder',
  'sys',
  'timers',
  'tls',
  '_tls_common',
  '_tls_legacy',
  '_tls_wrap',
  'tty',
  'url',
  'util',
  'v8',
  'vm',
  'zlib',
  'internal/async_hooks',
  'internal/buffer',
  'internal/child_process',
  'internal/cluster/child',
  'internal/cluster/master',
  'internal/cluster/round_robin_handle',
  'internal/cluster/shared_handle',
  'internal/cluster/utils',
  'internal/cluster/worker',
  'internal/encoding',
  'internal/errors',
  'internal/freelist',
  'internal/fs',
  'internal/http',
  'internal/inspector_async_hook',
  'internal/linkedlist',
  'internal/loader/Loader',
  'internal/loader/ModuleMap',
  'internal/loader/ModuleJob',
  'internal/loader/ModuleWrap',
  'internal/loader/ModuleRequest',
  'internal/loader/search',
  'internal/safe_globals',
  'internal/net',
  'internal/module',
  'internal/os',
  'internal/process/next_tick',
  'internal/process/promises',
  'internal/process/stdio',
  'internal/process/warning',
  'internal/process',
  'internal/querystring',
  'internal/process/write-coverage',
  'internal/readline',
  'internal/repl',
  'internal/socket_list',
  'internal/test/unicode',
  'internal/trace_events_async_hooks',
  'internal/url',
  'internal/util',
  'internal/util/types',
  'internal/http2/core',
  'internal/http2/compat',
  'internal/http2/util',
  'internal/v8_prof_polyfill',
  'internal/v8_prof_processor',
  'internal/streams/lazy_transform',
  'internal/streams/BufferList',
  'internal/streams/legacy',
  'internal/streams/destroy',
  'internal/wrap_js_stream',
  'v8/tools/splaytree',
  'v8/tools/codemap',
  'v8/tools/consarray',
  'v8/tools/csvparser',
  'v8/tools/profile',
  'v8/tools/profile_view',
  'v8/tools/logreader',
  'v8/tools/tickprocessor',
  'v8/tools/SourceMap',
  'v8/tools/tickprocessor-driver',
  'node-inspect/lib/_inspect',
  'node-inspect/lib/internal/inspect_client',
  'node-inspect/lib/internal/inspect_repl'
];

/**
* DependencyManager manages Dependencies
* @class
*/
module.exports = class DependencyManager {

  constructor (pkg) {
    this.initialize(pkg);
  }

  initialize (pkg) {
    let deps = Object.keys((pkg || {}).dependencies || {});
    this.byFile = {};
    this.origin = deps.slice();
    this.current = deps.slice();
    this.blacklist = [];
    this.inline = [];
    this.pending = [];
    this.cleanup = [];
    this._iteration = 0;
  }

  _reduce () {
    let byFile = this.byFile;
    this.inline = Object.keys(byFile).reduce(function (inline, pathname) {
      return inline.concat(
        byFile[pathname].filter(function (name) { return inline.indexOf(name) === -1 })
      );
    }, []);
    this.pending = this.inline.filter((function (dep) {
      return this.current.indexOf(dep) === -1 &&
        this.blacklist.indexOf(dep) === -1;
    }).bind(this));
    this.cleanup = this.current.filter((function (dep) {
      return this.inline.indexOf(dep) === -1 &&
        this.origin.indexOf(dep) === -1 &&
        NATIVE_MODULES.indexOf(dep) === -1;
    }).bind(this));
    return this;
  }

  remove (pathname) {
    if (pathname in this.byFile) {
      delete this.byFile[pathname];
      this._reduce();
      return [];
    } else {
      return null;
    }
  }

  add (pkg, pathname, deps = []) {
    this.current = Object.keys(pkg.dependencies || {});
    let nativeDeps = NATIVE_MODULES;
    let dependencies = [];
    dependencies = deps
      .filter(function (dep) { return nativeDeps.indexOf(dep) === -1; })//;
      .map(function (dep) {
        return dep.includes('/') && !dep.startsWith('@')
          ? dep.slice(0, dep.indexOf('/'))
          : dep;
      });
    this.byFile[pathname] = dependencies;
    this._reduce();
    return dependencies;
  }

  async getLatestVersion (packageName) {
    return await new Promise((resolve, reject) => {
      const options = {
        method: 'GET',
        hostname: 'registry.npmjs.org',
        path: `/${packageName}`
      };
      let req = https.request(options, res => {
        let body = '';
        res
          .on('data', data => { body += data; })
          .on('end', () => {
            try {
              let results = JSON.parse(body);
              if (results && results['dist-tags']) {
                return resolve({
                  name: packageName,
                  latest: results['dist-tags'].latest
                });
              } else {
                resolve({
                  name: packageName,
                  invalid: true
                });
              }
            } catch (err) {
              reject(err);
            }
          });
      });
      req.on('err', err => { reject(err); });
      req.end();
    });
  }

  async parsePackages(pending = [], cleanup = [], dependencies = {}) {
    let validated = await Promise.all(pending.map(packageName => this.getLatestVersion(packageName)));
    let valid = validated.filter(dep => !dep.invalid);
    let invalid = validated.filter(dep => dep.invalid).map(dep => dep.name);
    let added = valid.map(dep => dep.name);
    let removed = Object.keys(dependencies).reduce(function (removed, dep) {
      if (cleanup.indexOf(dep) > -1) {
        delete dependencies[dep];
        removed.push(dep);
      }
      return removed;
    }, []);
    return {
      added: added,
      removed: removed,
      invalid: invalid,
      dependencies: valid.reduce((dependencies, dep) => {
        dependencies[dep.name] = `^${dep.latest}`;
        return dependencies;
      }, dependencies)
    };
  }

  async update (pkg) {
    let iteration = ++this._iteration;
    let pkgDependencies = JSON.parse(JSON.stringify(pkg.dependencies || {}));
    let pending = this.pending.slice();
    let cleanup = this.cleanup.slice();
    await new Promise(resolve => setTimeout(() => resolve(), 300));
    if (this._iteration !== iteration) {
      throw new Error('Waiting on newer dependency update');
    }
    if (pending.length) {
      let result;
      try {
        result = await this.parsePackages(
          pending,
          cleanup,
          pkgDependencies
        );
      } catch (e) {
        console.error(e);
        throw new Error('Could not update dependencies automatically');
      }
      // exit if newer version has been invoked
      if (this._iteration !== iteration) {
        throw new Error('Waiting on newer dependency update');
      }
      this.blacklist = this.blacklist.concat(
        result.invalid.filter((function (dep) { return this.blacklist.indexOf(dep) === -1; }).bind(this))
      );
      return {
        dependencies: result.dependencies,
        added: result.added,
        removed: result.removed
      };
    } else {
      let removed = Object.keys(pkgDependencies).reduce((function (removed, name) {
        if (cleanup.indexOf(name) > -1) {
          delete pkgDependencies[name];
          removed.push(name);
        }
        return removed;
      }).bind(this), []);
      return {
        dependencies: pkgDependencies,
        added: [],
        removed: removed
      };
    }
  }

}
