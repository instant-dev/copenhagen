const MPFileSystem = require('./FileSystem.js');
const MPTextReconstructor = require('./TextReconstructor.js');

const EventEmitter = require('events');

module.exports = class MPProject extends EventEmitter {

  constructor (
    name, authState, metadata,
    downloadedFiles, restoredFiles, defaultFiles,
    readonlyFiles, fileWatchers, inactiveUsers = []
  ) {
    super();
    this.name = name;
    this.authState = authState || null;
    this.metadata = metadata || {};
    this.clients = [];
    this.fileSystem = new MPFileSystem(
      this,
      downloadedFiles, restoredFiles, defaultFiles,
      readonlyFiles, fileWatchers
    );
    let users = Object.keys(this.fileSystem.files)
      .reduce((users, pathname) => {
        let file = this.fileSystem.files[pathname];
        Object.keys(file.clientRevisions).forEach(uuid => users[uuid] = true);
        return users;
      }, {});
    this.inactiveUsers = this.listHistoricalUsers(inactiveUsers || []);
    this.textReconstructor = new MPTextReconstructor();
    this._saving = null; // stores save state
    this.fileSystem.on('update', (modifications) => {
      if (modifications && modifications.move) {
        this.clients.forEach(client => {
          if (client.isActiveFile(modifications.move.pathname)) {
            client.setActiveFile(modifications.move.newPathname);
          }
        });
      }
      this.broadcast(
        'filesystem.status',
        {
          files: this.fileSystem.serialize('status'),
          modifications: modifications || null
        }
      );
    });
    this.fileSystem.on('watch', (watchData) => {
      this.broadcast('filesystem.watch', watchData);
    });
  }

  listHistoricalUsers (inactiveUsers) {
    // we only care about inactiveUsers with histories...
    let users = Object.keys(this.fileSystem.files)
      .filter(pathname => this.fileSystem.files[pathname].textOperations)
      .reduce((users, pathname) => {
        Object.keys(this.fileSystem.files[pathname].textOperations.hasUser)
          .forEach(uuid => users[uuid] = true);
        return users;
      }, {});
    return inactiveUsers.filter(user => !!users[user.uuid]);
  }

  export (format) {
    return {
      name: this.name,
      authState: this.authState,
      metadata: this.metadata,
      inactiveUsers: this.listHistoricalUsers(this.inactiveUsers),
      files: this.fileSystem.export(format, format === 'cache')
    };
  }

  mergeState (authState, metadata, files = {}) {
    this.setAuthState(authState);
    this.setMetadata(metadata);
    let result = this.fileSystem.reload(files);
    result.overwritten.forEach(file => {
      this.broadcastByFile(
        file,
        'filesystem.overwrite',
        {
          pathname: file.pathname,
          file: file.serialize()
        }
      )
    });
  }

  setAuthState (authState) {
    this.authState = authState;
  }

  setMetadata (metadata) {
    metadata = metadata || {};
    if (JSON.stringify(metadata) !== JSON.stringify(this.metadata)) {
      this.metadata = metadata;
      this.broadcast('project.metadata.modified', {metadata: this.metadata});
    }
  }

  listAllUsers () {
    return [].concat(
      this.clients.map(client => client.serialize()),
      this.inactiveUsers
    );
  }

  serialize (options = {}) {
    let serialized = {
      name: this.name,
      metadata: this.metadata,
      users: this.listAllUsers(),
      activeUsers: this.clients.map(client => client.serialize()),
      files: this.fileSystem.serialize('status'),
    };
    if (options.includeWatchFiles) {
      serialized.watchFiles = this.fileSystem.serialize('watch');
    }
    return serialized;
  }

  toString () {
    return `${this.name}`;
  }

  addClient (client) {
    let inactiveIndex = this.inactiveUsers.findIndex(inactiveUser => {
      return inactiveUser.uuid === client.uuid;
    });
    if (inactiveIndex > -1) {
      this.inactiveUsers.splice(inactiveIndex, 1);
    }
    this.clients.push(client);
    return client;
  }

  hasClient (client) {
    return this.clients.indexOf(client) > -1;
  }

  removeClient (client, aborted) {
    Object.keys(this.fileSystem.files).forEach(key => {
      var file = this.fileSystem.files[key];
      if (file.hasClientRevision(client.uuid)) {
        client.quitProjectFile(key, true);
      }
    });
    this.clients.splice(this.clients.indexOf(client), 1);
    this.inactiveUsers = this.inactiveUsers.concat(
      this.listHistoricalUsers([client.serialize()])
    );
    this.fileSystem.emit('update');
    if (!this.clients.length) {
      this.emit('close');
    }
    return client;
  }

  // triggers a manual close of the whole project
  close () {
    this.clients.slice().forEach(client => client.quit());
  }

  broadcast (event, data) {
    this.clients.forEach(client => client.send(event, data));
    return this;
  }

  broadcastByFile (file, event, data) {
    this.clients
      .forEach(client => {
        let clientRevision = file.clientRevisions[client.uuid];
        if (clientRevision) {
          client.send(event, data);
        }
      });
    return this;
  }

  isSaving () {
    return !!this._saving;
  }

  saving () {
    if (!this._saving) {
      this._saving = {start: new Date().valueOf()};
      this.broadcast('project.saving', {});
    } else {
      console.error('Project#saving() called when project already saving');
    }
  }

  saveError (message = null) {
    if (this._saving) {
      this._saving.end = new Date().valueOf();
      this._saving.elapsed = this._saving.end - this._saving.start;
      this.broadcast('project.save.error', {summary: this._saving, message: message});
      this._saving = null;
    } else {
      console.error('Project#saveError() called when Project not saving');
    }
  }

  saveComplete (message = null) {
    if (this._saving) {
      this._saving.end = new Date().valueOf();
      this._saving.elapsed = this._saving.end - this._saving.start;
      this.broadcast('project.save.complete', {summary: this._saving, message: message});
      this._saving = null;
    } else {
      console.error('Project#saveComplete() called when Project not saving');
    }
  }

  writeFile (client, pathname, buffer) {
    let file = this.fileSystem.files[pathname];
    if (!file) {
      file = this.fileSystem.create(client, pathname, buffer, true);
    } else {
      file = this.fileSystem.overwrite(client, pathname, buffer);
    }
    this.clients
      .forEach(client => {
        let clientRevision = file.clientRevisions[client.uuid];
        if (clientRevision) {
          if (file.textOperations) {
            client.send(
              'filesystem.textoperations',
              {
                pathname: pathname,
                textOperations: file.textOperations.serialize(clientRevision)
              }
            );
          } else {
            client.send(
              'filesystem.overwrite',
              {
                pathname: pathname,
                file: file.serialize(clientRevision)
              }
            );
          }
        }
      });
    // this will always be "true", but may have been false before,
    // so send the update
    this.broadcast(
      'filesystem.modified',
      {
        pathname: pathname,
        modified: file.isModified()
      }
    );
    return file;
  }

};
