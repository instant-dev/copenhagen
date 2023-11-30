const uuid = require('uuid');
const EventEmitter = require('events');

const types = require('./helpers/types.js');

module.exports = class MPClient extends EventEmitter {

  constructor (connection, origin, remoteAddress, connectionRequest = {}, customEvents = {}) {
    super();
    this.uuid = uuid.v4();
    this.origin = origin;
    this.remoteAddress = remoteAddress;
    this.connection = connection;
    this.connectionRequest = {
      pathname: connectionRequest.pathname,
      query: connectionRequest.query,
      headers: connectionRequest.headers
    };
    this.project = null;
    this.username = null;
    this.nickname = this.username;
    this.color = '';
    this.image = '';
    this.active = true;
    this.primary = false;
    this._activePathname = null;
    this._customEvents = customEvents;
    this._verified = false; // verifies a connection is establishes
    this._identified = false; // makes sure a user connection is available
    this._verificationData = {};
    this._quitHook = () => {};
    this.nextPing = null;
    this.pingTimeout = null;
    this.pingResponseTime = 5000; // must hear ping within 5s
    this.pingDelayTime = 10000; // ping every 10s
    this.chunkSize = 64 * 1024; // 64 kb chunks
    this.log(`connected from ${this.origin}`);
    this.connection.on('message', (message) => {
      if (message.type === 'utf8') {
        this.receive(message.utf8Data);
      }
    });
    this.connection.on('error', (error) => {
      this.log(`Socket hang up: ${error.code}`, true);
      this.quit();
    });
    this.connection.on('close', connection => {
      this.quit();
    });
    this.ping();
  }

  // change UUID
  setUUID (value) {
    this.log(`reassigning uuid to "${value}"`);
    this.uuid = value || '';
  }

  // Whether or not this is the priority client, eg retains history
  setPrimary (value) {
    value = !!value;
    if (value === true) {
      this.log(`setting as primary client instance`);
    } else {
      this.log(`removing primary client instance designation`);
    }
    this.primary = value;
  }

  log (message, error) {
    if (!error) {
      console.log(`${new Date()} Client ${this.toString()} ${message}`);
    } else {
      console.error(`${new Date()} Client ${this.toString()} ${message}`);
    }
  }

  serialize () {
    return {
      uuid: this.uuid,
      username: this.username,
      nickname: this.nickname,
      color: this.color,
      image: this.image,
      active: this.active
    };
  }

  toString () {
    return `${this.remoteAddress} (${(this.username ? this.username + ':' : '')}${this.uuid.split('-').pop()})`;
  }

  identify (userData = {}, verificationData = {}) {
    if (!this.isConnected()) {
      throw new Error(`Cannot identify without a valid connection`);
    }
    this.username = userData.username || this.username;
    this.nickname = userData.nickname || this.username;
    this.color = userData.color || '';
    this.image = userData.image || '';
    this._identified = true;
    this._verificationData = verificationData;
    this.send('identify', {user: this.serialize()});
  }

  verification () {
    return this._verificationData;
  }

  error (e) {
    this.log(e.message, true);
    console.error(e);
    if (this.isConnected()) {
      const errorObject = {message: e.message};
      if (e.statusCode) {
        errorObject.statusCode = e.statusCode;
      }
      if (e.details) {
        errorObject.details = e.details;
      }
      this.send('error', errorObject);
    }
  }

  send (event, data) {
    if (!this.isConnected()) {
      this.error(new Error(`client disconnected before send, attempting to send "${event}"`));
      this.quit();
    } else {
      let message = JSON.stringify([event, data]);
      if (message.length > this.chunkSize) {
        let chunks = [];
        let chunkUUID = uuid.v4();
        for (let i = 0; i < message.length; i += this.chunkSize) {
          chunks.push(message.slice(i, i + this.chunkSize));
        }
        chunks.forEach((message, i) => {
          this.connection.send(JSON.stringify([
            'chunk',
            {
              uuid: chunkUUID,
              length: chunks.length,
              index: i,
              message: message
            }
          ]));
        });
        this.log(`sent "${event}" event in ${chunks.length} chunks`);
      } else {
        this.connection.send(JSON.stringify([event, data]));
        this.log(`sent "${event}" event`);
      }
    }
  }

  async receive (data) {
    this.log(`message received`);
    this.clearPing();
    this.ping();
    try {
      data = JSON.parse(data);
    } catch (e) {
      this.log(`message error: Malformed JSON`);
      data = ['-', 'Malformed JSON'];
    }
    if (!Array.isArray(data)) {
      this.log(`message error: Expecting Array`);
    } else if (!data[0] || typeof data[0] !== 'string') {
      this.log(`message error: Expecting Array[0] to be a string`);
    } else if (!data[1] || typeof data[1] !== 'object') {
      this.log(`message error: Expecting Array[1] to be an object`);
    } else if (data[0] === 'pong') {
      let now = new Date().valueOf();
      let time = parseInt(data[1] && data[1].timestamp) || new Date(0).valueOf();
      this.log(`"pong" received from downstream client, took ${now - time}ms`);
    } else if (!this._verified && data[0] !== 'verify') {
      this.log(`received event "${data[0]}" before verification complete`, true);
    } else if (!this._verified) {
      this.log(`received "${data[0]}" and now authenticating...`, true);
      this._verified = true;
      this.emit('verify', data[1]);
    } else if (!this._identified) {
      this.log(`received event "${data[0]}" before identification complete`, true);
    } else {
      this.log(`message triggered event: "${data[0]}"`);
      try {
        await this.event(data[0], data[1]);
      } catch (e) {
        this.log(`error for event "${data[0]}": "${e.message}"`, true);
        console.error(e);
      }
    }
  }

  save () {
    this.emit('save');
  }

  async event (eventName, eventPayload) {
    let customEventIdentifier = 'client.custom.';
    if (eventName.startsWith(customEventIdentifier)) {
      eventName = eventName.slice(customEventIdentifier.length);
      if (eventName in this._customEvents) {
        try {
          await this._customEvents[eventName](this, eventPayload);
        } catch (e) {
          this.error(e);
        }
      } else {
        throw new Error(`Custom event "${eventName}" not found`);
      }
    } else {
      switch (eventName) {
        case 'client.reauthenticate':
          this.emit('reauthenticate');
          break;
        case 'client.project.reauthenticate':
          this.emit('project.reauthenticate');
          break;
        case 'client.filesystem.download':
          let files = await this.project.fileSystem.downloadForWeb(
            eventPayload.format,
            eventPayload.pathnames,
            eventPayload.name || this.project.name.replace(/\W+/gi, '-')
          );
          this.send('filesystem.download', {files: files, format: eventPayload.format});
          break;
        case 'client.filesystem.refresh':
          let pathnames = eventPayload.pathnames
            .filter(pathname => this.project.fileSystem.fileExists(pathname))
            .map(pathname => {
              this.openProjectFile(pathname, false, true);
              return pathname;
            });
          this.send('filesystem.refresh', {pathnames: pathnames});
          this.project.fileSystem.emit('update');
          break;
        case 'client.filesystem.open':
          this.openProjectFile(eventPayload.pathname);
          break;
        case 'client.filesystem.activate':
          let activeFile = this.setActiveFile(eventPayload.pathname);
          if (activeFile) {
            this.project.fileSystem.fileOpenHook(this, activeFile.pathname, activeFile);
          }
          this.project.fileSystem.emit('update');
          break;
        case 'client.filesystem.close':
          this.closeProjectFile(eventPayload.pathname);
          break;
        case 'client.filesystem.textoperations':
          let file = this.receiveTextOperations(eventPayload.pathname, eventPayload.textOperations);
          break;
        case 'client.filesystem.acknowledgerevision':
          this.receiveAcknowledgeRevision(eventPayload.pathname, eventPayload.clientRevision);
          break;
        case 'client.filesystem.create':
          if (this.project) {
            let file = this.project.fileSystem.create(
              this,
              eventPayload.pathname,
              Buffer.from(eventPayload.value)
            );
            if (file.tempPathname) { // automatically open temporary paths
              this.openProjectFile(file.pathname, true);
            } else {
              this.save();
            }
          }
          break;
        case 'client.filesystem.copy':
          if (this.project) {
            let files = this.project.fileSystem.copy(
              this,
              eventPayload.pathname,
              eventPayload.newPathname,
              eventPayload.autoname
            );
            if (eventPayload.open) {
              this.openProjectFile(files[0].pathname, true);
            }
            this.save();
          }
          break;
        case 'client.filesystem.move.validate':
          let pathnameType = types.getType(eventPayload.pathname);
          let newPathnameType = types.getType(eventPayload.newPathname);
          this.send(
            'filesystem.move.validate',
            {
              pathname: eventPayload.pathname,
              newPathname: eventPayload.newPathname,
              validate: {
                pathname: {
                  type: pathnameType,
                  isBinaryType: types.isBinaryType(pathnameType)
                },
                newPathname: {
                  type: newPathnameType,
                  isBinaryType: types.isBinaryType(newPathnameType)
                }
              }
            }
          );
          return;
        case 'client.filesystem.move':
          if (this.project) {
            this.project.fileSystem.move(
              this,
              eventPayload.pathname,
              eventPayload.newPathname,
              eventPayload.autoname
            );
            this.save();
          }
          break;
        case 'client.filesystem.unlink':
          if (this.project) {
            this.project.fileSystem.unlink(this, eventPayload.pathname);
            this.setActiveFile(this._activePathname);
            this.save();
          }
          break;
        case 'client.filesystem.upload':
          if (this.project) {
            let file = this.project.fileSystem.upload(this, eventPayload.files);
            this.save();
          }
          break;
        case 'client.filesystem.save':
          if (this.project) {
            if (eventPayload.force) {
              this.save();
            } else {
              let file = this.project.fileSystem.open(eventPayload.pathname);
              if (file.isModified() && file.textOperations) {
                let reconstructed = this.project.textReconstructor.reconstruct(this.project, file);
                this.project.fileSystem.save(
                  this,
                  file.pathname,
                  reconstructed.value
                );
                if (file.isTemporary()) {
                  this.project.fileSystem.move(
                    this,
                    file.pathname,
                    file.tempPathname,
                    true
                  );
                }
                this.save();
              } else if (!this.project.isSaving()) {
                // Client expects a response even if there's nothing to save
                this.send('project.save.complete', {});
              }
            }
          }
          break;
        default:
          // do nothing
          break;
      }
    }
  }

  joinProject (project, openFile = false, reconnect = false) {
    if (!this.isConnected()) {
      throw new Error(`Cannot join project without a valid connection`);
    }
    this.project = project;
    this.project.addClient(this);
    this.log(`joined Project "${this.project.toString()}"`);
    this.send(
      'project.join',
      {
        project: this.project.serialize({includeWatchFiles: true}),
        openFile: !!openFile,
        reconnect: reconnect
      }
    );
    this.project.broadcast(
      'project.users.join',
      {
        users: [this.serialize()],
        activeUsers: this.project.clients.map(client => client.serialize())
      }
    );
    return this.project;
  }

  isActiveFile (pathname) {
    return this._activePathname && this._activePathname === pathname;
  }

  setActiveFile (pathname) {
    if (this._activePathname !== pathname) {
      this.clearActiveFile(this._activePathname);
    }
    if (this.project.fileSystem.fileExists(pathname)) {
      let activeFile = this.project.fileSystem.open(pathname);
      activeFile.setActive(this.uuid);
      this._activePathname = pathname;
      return activeFile;
    } else {
      this._activePathname = null;
      return null;
    }
  }

  clearActiveFile (pathname) {
    if (this._activePathname === pathname) {
      if (
        pathname &&
        this.project.fileSystem.fileExists(pathname)
      ) {
        let activeFile = this.project.fileSystem.open(pathname);
        activeFile.clearActive(this.uuid);
      }
      this._activePathname = null;
    }
  }

  openProjectFile (pathname, setActive = false, preventUpdate = false) {
    let file = this.project.fileSystem.open(pathname);
    file.setClientRevision(this.uuid, [-1, -1]);
    this.setActiveFile(pathname);
    this.log(`opened Project "${this.project.toString()}" File "${pathname}"`);
    this.send('filesystem.open', {file: file.serialize(), setActive: !!setActive});
    this.project.fileSystem.fileOpenHook(this, file.pathname, file);
    if (!preventUpdate) {
      this.project.fileSystem.emit('update');
    }
    return file;
  }

  // This just quits abruptly but retains a live session
  quitProjectFile (pathname, preventUpdate = false) {
    let file = this.project.fileSystem.open(pathname);
    file.clearClientRevision(this.uuid);
    this.clearActiveFile(pathname);
    this.log(`closed Project "${this.project.toString()}" File "${pathname}"`);
    if (!preventUpdate) {
      this.project.fileSystem.emit('update');
    }
    return file;
  }

  // this indicates the user wanted to close the file so we undo changes
  closeProjectFile (pathname, preventUpdate = false) {
    let file = this.quitProjectFile(pathname, true);
    if (!file.hasWorkingClients()) {
      if (file.isTemporary()) {
        this.project.fileSystem.unlink(this, file.pathname, preventUpdate);
      } else {
        file.resetHistory();
        if (!preventUpdate) {
          this.project.fileSystem.emit('update');
        }
        this.project.fileSystem.fileChangeHook(this, this.project, file.pathname, file);
      }
    } else if (!preventUpdate) {
      this.project.fileSystem.emit('update');
    }
    return file;
  }

  receiveTextOperations (pathname, textOperations) {
    let file = this.project.fileSystem.open(pathname);
    this.log(`received textOperations for "${this.project.toString()}" File "${pathname}"`);
    let result = file.textOperations.receiveClientTextOperations(this, textOperations, this.project.textReconstructor);
    if (result.addCount || result.removeCount) {
      if (result.optimized) {
        this.log(`optimized textOperations for "${this.project.toString()}" File "${pathname}"`);
        this.project.clients
          .forEach(client => {
            client.send(
              'filesystem.overwrite',
              {
                pathname: pathname,
                file: file.serialize()
              }
            );
          });
      } else {
        this.log(`processed textOperations for "${this.project.toString()}" File "${pathname}", +${result.addCount}, -${result.removeCount}`);
        this.project.clients
          .forEach(client => {
            let clientRevision = file.clientRevisions[client.uuid];
            if (clientRevision) {
              client.send(
                'filesystem.textoperations',
                {
                  pathname: pathname,
                  textOperations: file.textOperations.serialize(clientRevision)
                }
              );
            }
          });
      }
      let reconstructed = this.project.textReconstructor.reconstruct(this.project, file);
      if (!file.isReadOnly() && file.value !== reconstructed.value) {
        file.write(reconstructed.value);
        this.project.broadcast(
          'filesystem.modified',
          {
            pathname: pathname,
            modified: file.isModified()
          }
        );
        this.project.fileSystem.fileChangeHook(this, this.project, file.pathname, file);
      }
    }
    return file;
  }

  receiveAcknowledgeRevision (pathname, clientRevision) {
    let file = this.project.fileSystem.open(pathname);
    clientRevision = file.setClientRevision(this.uuid, clientRevision);
    this.log(`received Acknowledge Revision for "${this.project.toString()}" File "${pathname}": (${clientRevision.join(',')})`);
    this.send('filesystem.acknowledged', {pathname: pathname, clientRevision: clientRevision});
  }

  ping () {
    if (
      this.isConnected() &&
      this.active &&
      this.nextPing === null &&
      this.pingTimeout === null
    ) {
      this.nextPing = setTimeout(() => {
        if (this.isConnected()) {
          this.send('ping', {uuid: uuid.v4(), timestamp: new Date().valueOf()});
          this.pingTimeout = setTimeout(() => {
            this.error(new Error('disconnected due to client timeout'));
            this.quit();
          }, this.pingResponseTime);
        } else {
          this.error(new Error('disconnected between pings'));
          this.quit();
        }
      }, this.pingDelayTime);
    }
  }

  clearPing () {
    clearTimeout(this.nextPing);
    clearTimeout(this.pingTimeout);
    this.nextPing = null;
    this.pingTimeout = null;
  }

  isConnected () {
    return this.connection.connected;
  }

  setQuitHook (quitHook) {
    this._quitHook = quitHook;
  }

  quit () {
    let project = this.project;
    let isConnected = this.isConnected();
    let isActive = this.active;
    if (isConnected) {
      this.connection.close();
    }
    if (isActive) {
      this.active = false;
      this.clearPing();
      if (this.project && this.project.hasClient(this)) {
        this.project.removeClient(this);
        this.log(`disconnected and left project ${this.project.toString()}`);
        this.project.broadcast(
          'project.users.quit',
          {
            users: [this.serialize()],
            activeUsers: this.project.clients.map(client => client.serialize())
          }
        );
        this.project = null;
      }
    }
    this._quitHook(project, isConnected, isActive);
  }

};
