const MPClient = require('./Client.js');
const MPProject = require('./Project.js');

const Format = require('./helpers/format.js');

const http = require('http');

const websocketServer = require('websocket').server;

const USER_NICKNAME_IDENTIFIER = ' #';

module.exports = class MPServer {

  constructor () {
    this.projects = {};
    this.clients = [];
    this.verifyTimeLimit = 30000;
    this.lifetimeConnectionsCount = 0;
    this.httpServer = null;
    this.ws = null;
    this._port = null;
    // Keep track of project saving so we don't double up
    this._saving = {};
    this._savingQueue = {};
    this._saveActionQueue = {};
    // Also keep track of project downloading / closing
    this._downloading = {};
    this._closing = {};
  }

  log (message, error) {
    if (!error) {
      console.log(`${new Date()} Server ${this.toString()} ${message}`);
    } else {
      console.error(`${new Date()} Server ${this.toString()} ${message}`);
    }
  }

  toString () {
    return `:${this._port}`;
  }

  listen (port) {
    this._port = port;
    let customEvents = this.customEvents();
    this.httpServer = http.createServer(async (req, res) => {
      let result = await this.httpHandler(req, res);
      res.writeHead(result.statusCode, result.headers);
      res.end(result.body);
    });
    this.httpServer.listen(this._port, () => {
      this.log(`listening for connections`);
    });
    this.ws = new websocketServer({
      httpServer: this.httpServer,
      maxReceivedFrameSize: 10 * 1024 * 1024,
      maxReceivedMessageSize: 10 * 1024 * 1024
    });
    this.ws.on('request', async req => {
      let connection = req.accept(null, req.origin);
      let client = this.createClient(
        connection,
        req.origin,
        req.remoteAddress,
        {
          pathname: req.resourceURL.pathname,
          query: req.resourceURL.query,
          headers: req.httpRequest.headers
        },
        customEvents,
      );
      client.setQuitHook(this.clientQuitHook.bind(this, client));
      let verificationTimeout = setTimeout(() => {
        client.error(new Error(`Connection timed out. Expecting "verify" event within ${this.verifyTimeLimit}ms.`));
        client.quit();
      }, this.verifyTimeLimit);
      client.once('verify', async (verificationData) => {
        clearTimeout(verificationTimeout);
        let userData;
        try {
          userData = await this.authenticateUser(
            client,
            req.resourceURL.pathname,
            req.resourceURL.query,
            req.httpRequest.headers,
            verificationData
          );
        } catch (e) {
          client.error(e);
          client.quit();
          return;
        }
        try {
          let query = req.resourceURL.query;
          let project = await this.openProject(
            req.resourceURL.pathname,
            req.resourceURL.query,
            req.httpRequest.headers,
            verificationData
          );
          let isTemporaryFile = !!(
            query.temp_content &&
            project.fileSystem.isValidPathname(query.filename)
          );
          let filename;
          if (!!query.reconnect) {
            filename = null;
          } else if (isTemporaryFile) {
            filename = query.filename;
          } else if (project.fileSystem.fileExists(query.filename)) {
            filename = query.filename;
          } else {
            filename = await this.defaultOpenFilename(Object.keys(project.fileSystem.files));
            if (!project.fileSystem.fileExists(filename)) {
              filename = null;
            }
          }
          // Only set the active user from history state if there's not
          //   a currently active user...
          // Basically, "additional" identical users will be treated 2nd-class;
          //   can't reload state from initial user
          // We refer to the base client as the "primary" client
          //   We can use this status to optimize which file histories we store
          let activeClients = project.clients.filter(client => {
            return client.username === userData.username;
          });
          let inactiveUsers = project.inactiveUsers.filter(user => {
            return user.username === userData.username;
          });
          if (!activeClients.find(client => !!client.primary)) {
            if (inactiveUsers.length) {
              client.setUUID(inactiveUsers[0].uuid);
            }
            client.setPrimary(true);
          } else {
            let ids = activeClients.map(client => {
              let n = client.primary ? 0 : client.nickname.split(USER_NICKNAME_IDENTIFIER).pop();
              n = parseInt(n) || 0;
              return n;
            }).sort((a, b) => a > b ? 1 : -1);
            let nextId = ids.findIndex((id, n) => id > n);
            nextId = nextId === -1 ? ids.length : nextId;
            userData.nickname = [userData.nickname || userData.username, nextId].join(USER_NICKNAME_IDENTIFIER);
          }
          client.identify(userData, verificationData);
          client.joinProject(project, !!filename, !!query.reconnect);
          project.fileSystem.setFileOpenHook(this.fileOpenHook.bind(this));
          project.fileSystem.setFileChangeHook(this.fileChangeHook.bind(this));
          if (filename) {
            if (isTemporaryFile) {
              let buffer;
              try {
                buffer = Buffer.from(query.temp_content, 'base64');
              } catch (e) {
                buffer = Buffer.from('');
              }
              let file = project.fileSystem.create(
                client,
                `${project.fileSystem.__TEMPORARY_PREFIX()}${filename}`,
                buffer
              );
              client.openProjectFile(file.pathname);
            } else {
              client.openProjectFile(filename);
            }
          }
          // Do this after opening a default file so client gets proper events
          this.projectOpenHook(client, project); // run async
          // set client events...
          client.on('save', () => {
            this._queueSaveProject(
              req.resourceURL.pathname,
              req.resourceURL.query,
              req.httpRequest.headers,
              client.verification(),
              client,
              project
            )
          });
          // when a user asks to refresh their data...
          client.on('reauthenticate', async () => {
            let nextId = 1;
            let project = client.project;
            await Promise.all(
              project.clients
                .filter(c => c.username === client.username)
                .map(client => {
                  return (async () => {
                    let userData;
                    try {
                      userData = await this.authenticateUser(
                        client,
                        client.connectionRequest.pathname,
                        client.connectionRequest.query,
                        client.connectionRequest.headers,
                        client.verification()
                      );
                    } catch (e) {
                      client.error(e);
                      client.quit();
                      return;
                    }
                    if (!client.primary) {
                      userData.nickname = [userData.nickname || userData.username, nextId++].join(USER_NICKNAME_IDENTIFIER);
                    }
                    try {
                      client.identify(userData, client.verification());
                    } catch (e) {
                      client.error(e);
                      client.quit();
                      return;
                    }
                  })()
                })
            );
            project.broadcast(
              'project.users.join',
              {
                users: project.clients.map(client => client.serialize()),
                activeUsers: project.clients.map(client => client.serialize())
              }
            );
            project.fileSystem.emit('update');
          });
          // A metadata request basically asks for reauth across all users
          client.on('project.reauthenticate', async () => {
            let metadata = (await Promise.all(
              project.clients.map(client => {
                return (async () => {
                  let authData;
                  try {
                    authData = await this.authenticateProject(
                      client.connectionRequest.pathname,
                      client.connectionRequest.query,
                      client.connectionRequest.headers,
                      client.verification()
                    );
                  } catch (e) {
                    client.error(e);
                    client.quit();
                  }
                  return authData;
                })();
              })
            )).find(metadata => !!metadata);
            if (metadata) {
              project.setMetadata(metadata);
            }
          });
        } catch (e) {
          client.error(e);
          client.quit();
          return;
        }
      });
    });
    this.ready();
  }

  statistics () {
    let stats = Object.keys(this.projects).reduce((stats, name) => {
      let project = this.projects[name];
      let cacheProject = project.export('cache');
      let pathnames = Object.keys(cacheProject.files);
      let operationsCount = pathnames.reduce((count, key) => {
        let ops = cacheProject.files[key].operations;
        if (ops) {
          count += ops.add.length + ops.remove.length;
        }
        return count;
      }, 0);
      let cacheData = JSON.stringify(cacheProject);
      stats.projects.push({
        name: name,
        filesCount: pathnames.length,
        operationsCount: operationsCount,
        size: cacheData.length,
        readableSize: Format.bytes(cacheData.length)
      });
      stats.filesCount += pathnames.length;
      stats.operationsCount += operationsCount;
      stats.size += cacheData.length;
      return stats;
    }, {
      projects: [],
      clientsCount: this.clients.length,
      lifetimeConnectionsCount: this.lifetimeConnectionsCount,
      filesCount: 0,
      operationsCount: 0,
      size: 0,
      readableSize: ''
    });
    stats.readableSize = Format.bytes(stats.size);
    return stats;
  }

  createClient (connection, origin, remoteAddress, connectionRequest, customEvents) {
    this.log(`received connection from "${remoteAddress}"`);
    let client = new MPClient(
      connection,
      origin,
      remoteAddress,
      connectionRequest,
      customEvents
    );
    this.clients.push(client);
    this.lifetimeConnectionsCount++;
    connection.on('close', connection => {
      this.clients.splice(this.clients.indexOf(client), 1);
    });
    return client;
  }

  async waitForAllQueuesToEmpty (projectName) {
    this.log(`waiting for download + close + save queue for "${projectName}" to empty...`);
    while (
      this._downloading[projectName] ||
      this._closing[projectName] ||
      this._saving[projectName]
    ) {
      await new Promise(resolve => setTimeout(() => resolve(), 10));
    }
  }

  async waitForCloseQueueToEmpty (projectName) {
    this.log(`waiting for close queue for "${projectName}" to empty...`);
    while (this._closing[projectName]) {
      await new Promise(resolve => setTimeout(() => resolve(), 10));
    }
  }

  async openProject (reqPathname, reqQuery, reqHeaders, verificationData) {
    let projectName = reqQuery.project;
    await this.waitForCloseQueueToEmpty(projectName);
    let validationResult;
    try {
      validationResult = this.validateProjectName(projectName);
    } catch (e) {
      throw new Error(`Host validation failed before authentication: ${e.message}`);
    }
    if (!validationResult) {
      throw new Error(`Host validation failed before authentication`);
    }
    this.log(`authenticating client with "${projectName}"`);
    let authData = await this.authenticateProject(reqPathname, reqQuery, reqHeaders, verificationData);
    if (!authData) {
      throw new Error(`Could not authenticate with "${projectName}"`);
    } else {
      this.log(`authenticated client with "${projectName}" successfully!`);
      let authState = await this.readAuthenticatedState(authData);
      await this.waitForAllQueuesToEmpty(projectName);
      try {
        validationResult = this.validateProjectName(projectName);
      } catch (e) {
        throw new Error(`Host validation failed before load: ${e.message}`);
      }
      if (!validationResult) {
        throw new Error(`Host validation failed before load`);
      }
      return await this.loadProject(reqPathname, reqQuery, reqHeaders, verificationData, authData, authState);
    }
  }

  async loadProject (reqPathname, reqQuery, reqHeaders, verificationData, authData, authState) {
    let projectName = reqQuery.project;
    if (
      !this.projects[projectName] ||
      this.projects[projectName].authState !== authState
    ) {
      this._downloading[projectName] = true;
      let shouldDownload = true;
      let restoredProject = null;
      let downloadedProject = null;
      if (
        this.projects[projectName] &&
        this.projects[projectName].authState !== authState
      ) {
        this.log(`authState for "${projectName}" out of date, download required...`);
      } else {
        this.log(`attempting to restore project "${projectName}"...`);
        try {
          restoredProject = await this.restoreProject(reqPathname, reqQuery, reqHeaders, verificationData);
          if (restoredProject) {
            if (
              process.env.ENVIRONMENT === 'local' &&
              projectName === process.env.LOCAL_BACKUP_NAME
            ) {
              shouldDownload = false;
            } else if (
              restoredProject &&
              restoredProject.authState !== authState
            ) {
              this.log(`authState for "${projectName}" cache out of date, download required...`);
              shouldDownload = true;
            } else {
              shouldDownload = false;
            }
          }
        } catch (e) {
          this.log(`failed to restore project "${projectName}"!`);
          console.error(e);
        }
      }
      if (!shouldDownload) {
        delete this._downloading[projectName];
        this.log(`successfully restored project "${projectName}"!`);
      } else {
        this.log(`downloading project "${projectName}"...`);
        try {
          downloadedProject = await this.downloadProject(reqPathname, reqQuery, reqHeaders, verificationData);
          if (authState === null) {
            authState = downloadedProject.authState;
          }
        } catch (e) {
          delete this._downloading[projectName];
          throw e;
        }
        delete this._downloading[projectName];
        this.log(`downloaded project "${projectName}"!`);
      }
      if (this.projects[projectName]) {
        this.log(`merging into existing project "${projectName}"...`);
        this.projects[projectName].mergeState(
          authState,
          downloadedProject.metadata,
          downloadedProject.files
        );
      } else {
        this.log(`loading new project "${projectName}"...`);
        let metadata = downloadedProject
          ? downloadedProject.metadata
          : restoredProject.metadata;
        let inactiveUsers = restoredProject
          ? restoredProject.inactiveUsers
          : [];
        let filenames = downloadedProject
          ? Object.keys(downloadedProject.files)
          : Object.keys(restoredProject.files);
        let defaultFiles = await this.defaultProjectFiles(filenames);
        let readonlyFiles = await this.readonlyFiles(filenames);
        let fileWatchers = await this.fileWatchers(filenames);
        let project = this.projects[projectName] = new MPProject(
          projectName,
          authState,
          metadata,
          downloadedProject ? downloadedProject.files : null,
          restoredProject ? restoredProject.files : null,
          defaultFiles,
          readonlyFiles,
          fileWatchers,
          inactiveUsers
        );
        project.on('close', () => this.closeProject(project));
      }
    }
    return this.projects[projectName];
  }

  async closeProject (project) {
    await this.waitForAllQueuesToEmpty(project.name); // Make sure we wait for last save, download, close
    if (this.projects[project.name]) {
      project.close();
      this._closing[project.name] = true;
      this.log(`closing project "${project.name}"...`);
      this.log(`backing up project "${project.name}"...`);
      try {
        await this.backupProject(project.name, project.export('cache'));
      } catch (e) {
        this.log(`failed to backup project "${project.name}"`);
        console.error(e);
      }
      this.log(`cleaning up project "${project.name}"...`);
      await this.projectCloseHook(project);
      delete this.projects[project.name];
      delete this._closing[project.name];
      this.log(`closed project "${project.name}"!`);
    }
  }

  // Can overwrite these to provide restore from cache possibilities
  async backupProject (name, projectData) {
    return null;
  }

  // Can overwrite these to provide restore from cache possibilities
  async restoreProject (reqPathname, reqQuery, reqHeaders, verificationData) {
    return null;
  }

  // This runs an action as if it's a save...
  async saveAction (client, fnAction) {
    let projectName = client.project.name;
    this._saveActionQueue[projectName] = this._saveActionQueue[projectName] || [];
    this._saveActionQueue[projectName].push(fnAction);
    this._dequeueSaves(client.project);
  }

  async _queueSaveProject (reqPathname, reqQuery, reqHeaders, verificationData, client, project) {
    let projectName = project.name;
    this._savingQueue[projectName] = this._savingQueue[projectName] || [];
    this._savingQueue[projectName].push({reqPathname, reqQuery, reqHeaders, verificationData, client, project});
    this._dequeueSaves(project);
  }

  async _dequeueSaves (project) {
    let projectName = project.name;
    await this.waitForCloseQueueToEmpty(projectName); // Make sure the project is closed...
    if (this.projects[projectName] && !this._saving[projectName]) {
      this._saving[projectName] = true;
      this._saveActionQueue[projectName] = this._saveActionQueue[projectName] || [];
      this._savingQueue[projectName] = this._savingQueue[projectName] || [];
      // Inject a 10ms delay to collect multiple save() calls
      // This allows client.save() logic to run repeatedly without duplicating saves
      await new Promise(resolve => setTimeout(() => resolve(), 10));
      project.saving();
      let error = null;
      // We want to first iterate over "saveActions" which are actions that look
      // like filesystem saves but aren't (eg config changes)
      // Then we'll try to apply the latest filesystem change as well...
      // We keep a loop incase new actions come into either one of the queues
      // while we're already saving
      while (
        this._saveActionQueue[projectName].length ||
        this._savingQueue[projectName].length
      ) {
        if (this._saveActionQueue[projectName].length) {
          let fnAction = this._saveActionQueue[projectName].pop();
          try {
            await fnAction();
            error = null;
          } catch (e) {
            this._saveActionQueue[projectName] = [];
            error = e;
          }
        }
        if (this._savingQueue[projectName].length) {
          let saveItem = this._savingQueue[projectName].pop();
          this._savingQueue[projectName] = [];
          try {
            let project = await this.saveProject(
              saveItem.reqPathname,
              saveItem.reqQuery,
              saveItem.reqHeaders,
              saveItem.verificationData,
              saveItem.client,
              saveItem.project
            );
            error = null;
          } catch (e) {
            error = e;
          }
        }
      }
      if (error) {
        project.saveError(error.message);
        delete this._saving[projectName];
      } else {
        project.saveComplete('Save complete!');
        delete this._saving[projectName];
      }
    }
  };

  async saveProject (reqPathname, reqQuery, reqHeaders, verificationData, client, project) {
    let authData = await this.authenticateProject(reqPathname, reqQuery, reqHeaders, verificationData);
    if (!authData) {
      throw new Error(`Save aborted, authentication failed`);
    }
    let authState = await this.readAuthenticatedState(authData);
    // This is a no-op if the project exists in memory,
    // Otherwise we're loading it from the cache / detecting mismatch
    project = await this.loadProject(reqPathname, reqQuery, reqHeaders, verificationData, authData, authState);
    let files =  project.fileSystem.export('buffer');
    await this.uploadProject(reqPathname, reqQuery, reqHeaders, verificationData, client, project, files);
    return project;
  }

  /**
  * The following methods can be used to extend the core MP server functionality
  */

  // Perform actions when the server is ready
  async ready () {
    return true;
  }

  // An HTTP handler to extend functionality if needed
  async httpHandler (req, res) {
    let requestHeaders = req.headers;
    let contentType = (requestHeaders['content-type'] || '').split(';')[0];
    let url = new URL(`http://${requestHeaders.host}${req.url}`);
    if (url.pathname === '/projects/open') {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type'
        },
        body: JSON.stringify({websocket_url: `ws://${requestHeaders.host}`})
      };
    } else {
      return {
        statusCode: 404,
        headers: {},
        body: Buffer.from([])
      };
    }
  }

  // Load these files into the project by default
  async defaultProjectFiles (fileList) {
    return {};
  }

  // These files are default readonly
  async readonlyFiles (fileList) {
    return {};
  }

  // This is the default filename to open when project loaded if none provided
  async defaultOpenFilename (fileList) {
    return null;
  }

  // Watch these files for changes and broadcast them to clients
  async fileWatchers (fileList) {
    return {};
  }

  // sets custom event handlers...
  customEvents () {
    return {};
  }

  // Run this on project open, for each client
  async projectOpenHook (client, project) {
    return true;
  }

  // Run this on project close, when all clients have disconnected
  async projectCloseHook (project) {
    return true;
  }

  // Run this on file open
  async fileOpenHook (client, pathname, file) {
    return true;
  }

  // Run this on file changes
  async fileChangeHook (client, project, pathname, file, oldPathname, oldFile) {
    return true;
  }

  // Run this on client quit
  async clientQuitHook (client) {
    return true;
  }

  // Authenticate user globally, returning their username, color and image
  async authenticateUser (client, reqPathname, reqQuery, reqHeaders) {
    var n = (this.lifetimeConnectionsCount - 1) % 4;
    return {
      username: ['jack', 'kate', 'locke', 'sawyer'][n],
      color: ['#6090f0', '#f03030', '#30f060', '#f0a030'][n],
      image: ''
    };
  }

  // Validates Project name, must be synchronous
  // Must return a truthy value to pass
  validateProjectName (name) {
    return true;
  }

  // Should return a metadata object for the project
  // returns authData for `readAuthenticatedState()`
  async authenticateProject (reqPathname, reqQuery, reqHeaders, verificationData) {
    return {};
  }

  // Reads state from an `authenticateProject` call
  async readAuthenticatedState (authData) {
    return null;
  }

  // Download a project from storage
  async downloadProject (reqPathname, reqQuery, reqHeaders, verificationData) {
    return {
      authState: null,
      metadata: {},
      files: {
        'hello.txt': Buffer.from('Hello world'),
        'hello.js': Buffer.from(
          Array(1000).fill(0).map(function () {
            return String.fromCharCode(
              96 + Math.floor(26 * Math.random())
            ).repeat(Math.floor(Math.random() * 32))
          }).join('\n')
        ),
        'FolderA/someA.txt': Buffer.from(
          Array(1000).fill(0).map(function () {
            return String.fromCharCode(
              96 + Math.floor(26 * Math.random())
            ).repeat(Math.floor(Math.random() * 32))
          }).join('\n')
        ),
        'FolderA/A-Folder/1.txt': Buffer.from(
          Array(1000).fill(0).map(function () {
            return String.fromCharCode(
              96 + Math.floor(26 * Math.random())
            ).repeat(Math.floor(Math.random() * 32))
          }).join('\n')
        ),
        'FolderA/A-Folder/2.txt': Buffer.from(
          Array(1000).fill(0).map(function () {
            return String.fromCharCode(
              96 + Math.floor(26 * Math.random())
            ).repeat(Math.floor(Math.random() * 32))
          }).join('\n')
        ),
        'FolderB/someB.txt': Buffer.from(
          Array(1000).fill(0).map(function () {
            return String.fromCharCode(
              96 + Math.floor(26 * Math.random())
            ).repeat(Math.floor(Math.random() * 32))
          }).join('\n')
        ),
        'FolderB/someC.txt': Buffer.from(
          Array(1000).fill(0).map(function () {
            return String.fromCharCode(
              96 + Math.floor(26 * Math.random())
            ).repeat(Math.floor(Math.random() * 32))
          }).join('\n')
        )
      }
    };
  }

  // Upload a project into storage
  async uploadProject (reqPathname, reqQuery, reqHeaders, verificationData, files) {
    await new Promise((resolve) => {
      setTimeout(() => resolve(true), 1000);
    });
  }

};
