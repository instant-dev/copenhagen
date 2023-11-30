module.exports = class ProviderManager {

  constructor () {
    this.byFile = {};
    this.eventProviders = [];
  }

  remove (pathname) {
    let providers = this.byFile[pathname];
    delete this.byFile[pathname];
    if (providers && providers.length) {
      return [];
    } else {
      return null;
    }
  }

  add (pathname, providers = []) {
    let existingProviders = this.byFile[pathname] || [];
    let newProviders = providers.slice().sort();
    if (existingProviders.join(',') !== newProviders.join(',')) {
      this.byFile[pathname] = newProviders;
      return newProviders.slice();
    } else {
      return null;
    }
  }

  updateEvents (events) {
    let providers = [];
    if (events && typeof events === 'object') {
      providers = Object.keys(events).map(pathname => {
        let eventName = events[pathname].name;
        let provider = eventName.split('.')[0];
        return provider;
      });
    }
    let eventProviders = [...new Set(providers)].sort();
    if (this.eventProviders.join(',') !== eventProviders.join(',')) {
      this.eventProviders = eventProviders;
      return eventProviders.slice();
    } else {
      return null;
    }
  }

  list () {
    let mapped = Object.keys(this.byFile).map(pathname => this.byFile[pathname]);
    let all = [].concat.apply([], mapped.concat(this.eventProviders));
    return [...new Set(all)];
  }

}
