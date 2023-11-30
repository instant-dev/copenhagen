const MPFile = require('./File.js');
const types = require('./helpers/types.js');
const tar = require('./helpers/tar.js');

const EventEmitter = require('events');
const uuid = require('uuid');

const TEMPORARY_PREFIX = '*:';

module.exports = class MPFileSystem extends EventEmitter {

  constructor (
    project,
    downloadedFiles = null, restoredFiles = null, defaultFiles = {},
    readonlyFiles = {}, fileWatchers = {}
  ) {
    super();
    this.project = project;
    this._saveQueue = [];
    this.fileWatchers = fileWatchers;
    this.setFileOpenHook();
    this.setFileChangeHook();
    if (restoredFiles) {
      this.importFromCache(
        downloadedFiles,
        restoredFiles,
        defaultFiles,
        readonlyFiles
      );
    } else {
      Object.keys(defaultFiles).forEach(pathname => {
        downloadedFiles[pathname] =
          downloadedFiles[pathname] || defaultFiles[pathname];
      });
      this.load(null, downloadedFiles, readonlyFiles);
    }
  }

  setFileOpenHook (fileOpenHook = function () {}) {
    this.fileOpenHook = fileOpenHook;
  }

  setFileChangeHook (fileChangeHook = function () {}) {
    this.fileChangeHook = fileChangeHook;
  }

  __TEMPORARY_PREFIX () {
    return TEMPORARY_PREFIX;
  }

  isValidPathname (pathname) {
    try {
      this._sanitizePathname(pathname);
    } catch (e) {
      return false;
    }
    return true;
  }

  _watchHook (client, pathname, oldPathname = null) {
    let file = this.files[pathname] || null;
    let oldFile = oldPathname && (this.files[oldPathname] || null);
    if (this.fileWatchers[pathname]) {
      this.emit(
        'watch',
        {
          pathname: pathname,
          file: file && file.serialize()
        }
      );
    } else {
      this.fileChangeHook(client, this.project, pathname, file, oldPathname, oldFile);
    }
  }

  _autoname (pathname, newPathname, autoname = false) {
    newPathname = this._sanitizePathname(newPathname, true);
    if (!autoname && this.exists(newPathname)) {
      throw new Error(`newPathname "${newPathname}" already exists`);
    } else {
      let info = this.info(pathname);
      let paths = newPathname.split('/');
      let filename = paths.pop();
      let prefix = paths.length ? paths.join('/') + '/' : '';
      let ext = filename.split('.').pop();
      if (info.isDirectory) {
        ext = '';
      } else if (ext === filename) {
        ext = '';
      } else {
        ext = `.${ext}`;
        filename = filename.slice(0, -ext.length);
      }
      let i = 0;
      let nPathname = `${prefix}${filename}${ext}`;
      while (this.exists(nPathname)) {
        if (filename.startsWith('__') && filename.endsWith('__')) {
          filename = filename.slice(2, -2);
        }
        nPathname = `${prefix}${filename}${i++}${ext}`;
      }
      newPathname = nPathname;
    }
    return newPathname;
  }

  _sanitizePathname (pathname, allowEmpty = false) {
    pathname = typeof pathname === 'string' ? pathname : '';
    allowEmpty = !!allowEmpty;
    let prefix = '';
    if (pathname.startsWith('/')) {
      pathname = pathname.slice(1);
    }
    if (pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
    if (pathname.startsWith(TEMPORARY_PREFIX)) {
      prefix = TEMPORARY_PREFIX;
      pathname = pathname.slice(TEMPORARY_PREFIX.length);
      allowEmpty = false; // no empty temp files...
    }
    if (!pathname && allowEmpty) {
      return prefix + pathname;
    } else if (prefix && pathname.indexOf('/') > -1) {
      throw new Error('Temporary files can not have subpaths');
    } else if (!pathname) {
      throw new Error('Pathname must not be empty');
    } else if (pathname.startsWith('/')) {
      throw new Error('Pathname must not start with "/"');
    } else if (pathname.endsWith('/')) {
      throw new Error('Pathname must not end with "/"');
    } else if (pathname.endsWith('/.') || pathname === '.') {
      throw new Error('Pathname must not end with "/."');
    } else if (pathname.trim() !== pathname) {
      throw new Error('Pathname must not start or end with empty space');
    } else if (pathname.match(/\.\./gi)) {
      throw new Error('Subpaths must not contain ..');
    } else if (pathname.match(/\/\.(\/|$)/gi)) {
      throw new Error('Subpaths must not contain /./');
    } else if (!pathname.match(/^([^\/\*<>"']+\/)*[^\/\*<>"']+$/gi)) {
      throw new Error('Subpaths must not be empty and must not contain *, <, >, \, \' or ".');
    } else {
      return prefix + pathname;
    }
  }

  commit () {
    Object.keys(this.files).forEach(key => this.files[key].commit());
    this.emit('update');
    return this.files;
  }

  isTemporary (pathname) {
    pathname = this._sanitizePathname(pathname);
    return !!this.files[pathname] && this.files[pathname].isTemporary();
  }

  getTemporaryPathname (pathname) {
    pathname = this._sanitizePathname(pathname);
    return (this.files[pathname] && this.files[pathname].tempPathname) || null;
  }

  exists (pathname) {
    pathname = this._sanitizePathname(pathname, true);
    return !!this.files[pathname] ||
      Object.keys(this.files)
        .filter(key => pathname ? key.startsWith(pathname + '/') : true)
        .length > 0;
  }

  fileExists (pathname) {
    return !!this.files[pathname];
  }

  info (pathname) {
    if (!this.exists(pathname)) {
      throw new Error(`No file or directory matching "${pathname}" found`);
    } else if (this.fileExists(pathname)) {
      return {isDirectory: false};
    } else {
      return {isDirectory: true};
    }
  }

  reload (files) {
    let overwritten = [];
    Object.keys(this.files).forEach(pathname => {
      let file = this.files[pathname];
      if (
        !file.isTemporary() &&
        !file.isReadOnly() &&
        !files[pathname]
      ) {
        this.unlink(null, pathname, true);
      } else if (files[pathname]) {
        if (files[pathname].toString('base64') !== file.initialBuffer.toString('base64')) {
          overwritten.push(file);
          file.overwrite(files[pathname]);
          file.commit();
          this._watchHook(null, pathname);
        }
        delete files[pathname];
      }
    });
    Object.keys(files).forEach(pathname => {
      this.create(null, pathname, files[pathname], false, true)
    });
    this.emit('update');
    return {overwritten: overwritten};
  }

  importFromCache (
    downloadedFiles = null, restoredFiles = {}, defaultFiles = {},
    readonlyFiles = {}
  ) {
    let pathnames = [
      ...(new Set([].concat(
        Object.keys(downloadedFiles || {}),
        Object.keys(restoredFiles),
        Object.keys(defaultFiles)
      )))
    ];
    return this.files = pathnames.reduce((files, pathname) => {
      let cacheFile = restoredFiles[pathname] || null;
      let refFile = (downloadedFiles && downloadedFiles[pathname]) || null;
      let defaultFile = defaultFiles[pathname] || null;
      let fromCache = false;
      if (downloadedFiles) {
        if (
          refFile && cacheFile &&
          cacheFile.initialBuffer === refFile.toString('base64')
        ) {
          // We only import from cache if there's a record of the file existing
          // in both the saved version and the cache, and their initialBuffers
          // are equal...
          fromCache = true;
        }
      } else {
        // Or if there are now downloadedFiles (pure restoration)
        fromCache = true;
      }
      // We'll end up NOT loading the file if the cache had it, but the
      // downloaded files did not - indicates a file deletion
      if (cacheFile && fromCache) {
        files[pathname] = new MPFile(
          pathname,
          Buffer.from(cacheFile.buffer, 'base64'),
          cacheFile.tempPathname,
          cacheFile.readonly || !!readonlyFiles[pathname],
          Buffer.from(cacheFile.initialBuffer, 'base64'),
          cacheFile.operations
        );
      } else if (refFile || defaultFile) {
        files[pathname] = new MPFile(
          pathname,
          refFile || defaultFile,
          null,
          (cacheFile && cacheFile.readonly) || !!readonlyFiles[pathname]
        );
      }
      return files;
    }, {});
  }

  export (format, includeTemporary) {
    return Object.keys(this.files).reduce((files, key) => {
      let file = this.files[key];
      if (!file.isTemporary() || includeTemporary) {
        files[key] = file.export(format);
      }
      return files;
    }, {});
  }

  async downloadForWeb (format, pathnames, name) {
    let files = {};
    pathnames = pathnames || Object.keys(this.files);
    switch (format) {
      case 'blob':
        pathnames.forEach(pathname => {
          if (this.fileExists(pathname)) {
            let file = this.files[pathname];
            files[pathname] = {
              value: {_base64: file.initialBuffer.toString('base64')},
              type: file.type
            };
          }
        });
        break;
      case 'tarball':
        pathnames.forEach(pathname => {
          if (this.fileExists(pathname)) {
            let file = this.files[pathname];
            files[pathname] = file.initialBuffer;
          }
        });
        let tarball = await tar.pack(files);
        files = {};
        files[`${name.split('/').pop()}.tgz`] = {
          value: {_base64: tarball.toString('base64')},
          type: 'application/gzip'
        };
        break;
      default:
        throw new Error(`Invalid download format: "${format}"`);
        break;
    }
    return files;
  }

  serialize (serializationFormat) {
    switch (serializationFormat) {
      case 'status': // returns file structure and people viewing files
        return Object.keys(this.files).reduce((files, key) => {
          let file = this.files[key];
          let status = {
            type: file.type,
            modified: file.isModified(),
            tempPathname: file.tempPathname,
            readonly: file.readonly,
            users: Object.keys(file.clientActivity)
              .reduce((users, uuid) => {
                users[uuid] = true;
                return users;
              }, {})
          };
          files[key] = status;
          return files;
        }, {});
        break;
      case 'watch':
        return Object.keys(this.fileWatchers).reduce((files, pathname) => {
          if (this.fileExists(pathname)) {
            files[pathname] = this.files[pathname].serialize()
          } else {
            files[pathname] = null;
          }
          return files;
        }, {});
      default:
        // do nothing right now
        break;
    }
  }

  open (pathname) {
    pathname = this._sanitizePathname(pathname, true);
    let file = this.files[pathname];
    if (!file) {
      throw new Error(`File "${pathname}" not found`);
    }
    return file;
  }

  load (client, files = {}, readonlyFiles = {}) {
    this.files = {};
    Object.keys(files).forEach(key => this.create(client, key, files[key], !!readonlyFiles[key], true));
    return this.files;
  }

  upload (client, files = []) {
    files.forEach(fileData => {
      let buffer = typeof fileData.value === 'object' && fileData.value.hasOwnProperty('_base64')
        ? Buffer.from(fileData.value._base64, 'base64')
        : Buffer.from(fileData.value || '', 'utf8');
      let file = this.create(client, `${TEMPORARY_PREFIX}${fileData.pathname}`, buffer, false, true);
      this.move(client, file.pathname, file.tempPathname, true, true);
    });
    this.emit('update');
  }

  create (client, pathname, buffer, readonly = false, preventUpdate = false) {
    let tempPathname = null;
    if (pathname.startsWith(TEMPORARY_PREFIX)) { // Temporary files...
      tempPathname = this._sanitizePathname(pathname.slice(TEMPORARY_PREFIX.length));
      pathname = this._sanitizePathname(`${TEMPORARY_PREFIX}${uuid.v4()}`);
    } else {
      pathname = this._sanitizePathname(pathname);
    }
    if (this.exists(pathname)) {
      throw new Error(`Pathname "${pathname}" already exists`);
    }
    let file = new MPFile(pathname, buffer, tempPathname, readonly);
    this.files[pathname] = file;
    if (!preventUpdate) {
      this.emit('update');
    }
    this._watchHook(client, pathname);
    return file;
  }

  move (client, pathname, newPathname, autoname = false, preventUpdate = false) {
    let files = [];
    pathname = this._sanitizePathname(pathname);
    if (!this.exists(pathname)) {
      throw new Error(`Pathname ${pathname} does not exist`);
    }
    let watchHooks = [];
    if (newPathname.startsWith(TEMPORARY_PREFIX)) {
      let file = this.files[pathname];
      if (!this.isTemporary(pathname)) {
        throw new Error(`Pathname ${pathname} can not be converted to a temporary file`);
      } else {
        newPathname = this._sanitizePathname(newPathname.slice(TEMPORARY_PREFIX.length));
        files.push(file.renameTemp(newPathname));
      }
      watchHooks.push([client, pathname, pathname]);
      if (!preventUpdate) {
        let moveData = {pathname: pathname, newPathname: pathname};
        moveData.info = {type: file.type, tempPathname: file.pathname};
        this.emit('update', {move: moveData});
      }
    } else {
      newPathname = this._autoname(pathname, newPathname, autoname);
      let file = this.files[pathname];
      if (!file) {
        let pathnames = Object.keys(this.files)
          .filter(key => pathname ? key.startsWith(pathname + '/') : true);
        if (!pathnames.length) {
          throw new Error(`No file or directory matching "${pathname}" found`);
        }
        pathnames
          .filter(singlePathname => !this.files[singlePathname].isReadOnly()) // do not move readonly files
          .forEach(singlePathname => {
            let newSinglePathname = newPathname + singlePathname.slice(pathname.length);
            files.push(this.files[newSinglePathname] = this.files[singlePathname].rename(newSinglePathname));
            delete this.files[singlePathname];
            watchHooks.push([client, newSinglePathname, singlePathname]);
          });
      } else {
        if (file.isReadOnly()) {
          throw new Error(`Can not move readonly file "${file.pathname}"`);
        }
        files.push(this.files[newPathname] = this.files[pathname].rename(newPathname));
        delete this.files[pathname];
        watchHooks.push([client, newPathname, pathname]);
      }
      if (!preventUpdate) {
        let moveData = {pathname: pathname, newPathname: newPathname};
        if (file) {
          moveData.info = {type: file.type, tempPathname: null};
        }
        this.emit('update', {move: moveData});
      }
    }
    watchHooks.forEach(args => this._watchHook(...args));
    return files;
  }

  copy (client, pathname, newPathname, autoname = false) {
    let files = [];
    pathname = this._sanitizePathname(pathname);
    if (!this.exists(pathname)) {
      throw new Error(`Pathname ${pathname} does not exist`);
    }
    let watchHooks = [];
    if (newPathname.startsWith(TEMPORARY_PREFIX)) {
      if (!this.isTemporary(pathname)) {
        throw new Error(`Pathname ${pathname} can not be copied to a temporary file`);
      } else {
        let tempPathname = this._sanitizePathname(newPathname.slice(TEMPORARY_PREFIX.length));
        newPathname = this._sanitizePathname(`${TEMPORARY_PREFIX}${uuid.v4()}`);
        files.push(this.files[newPathname] = new MPFile(newPathname, this.files[pathname].buffer, tempPathname));
        watchHooks.push([client, newPathname, pathname]);
      }
    } else {
      newPathname = this._autoname(pathname, newPathname, autoname);
      let file = this.files[pathname];
      if (!file) {
        let pathnames = Object.keys(this.files)
          .filter(key => pathname ? key.startsWith(pathname + '/') : true);
        if (!pathnames.length) {
          throw new Error(`No file or directory matching "${pathname}" found`);
        }
        pathnames.forEach(singlePathname => {
          let newSinglePathname = newPathname + singlePathname.slice(pathname.length);
          files.push(this.files[newSinglePathname] = new MPFile(newSinglePathname, this.files[singlePathname].buffer));
          watchHooks.push([client, newSinglePathname, singlePathname]);
        });
      } else {
        files.push(this.files[newPathname] = new MPFile(newPathname, this.files[pathname].buffer));
        watchHooks.push([client, newPathname, pathname]);
      }
    }
    this.emit('update');
    watchHooks.forEach(args => this._watchHook(...args));
    return files;
  }

  unlink (client, pathname, preventUpdate = false) {
    pathname = this._sanitizePathname(pathname);
    let pathnames = [].concat(
      pathname,
      Object.keys(this.files)
        .filter(key => key.startsWith(pathname + '/'))
    );
    if (pathnames.length === 1) {
      if (this.fileExists(pathname) && this.files[pathnames[0]].isReadOnly()) {
        throw new Error(`Can not unlink readonly file "${pathnames[0]}"`);
      }
    }
    let watchHooks = []
    pathnames
      .filter(pathname => this.fileExists(pathname))
      .filter(pathname => !this.files[pathname].isReadOnly()) // do not unlink readonly files
      .forEach(pathname => {
        let file = this.files[pathname];
        delete this.files[pathname];
        watchHooks.push([client, pathname]);
      });
    if (!preventUpdate) {
      this.emit('update');
    }
    watchHooks.forEach(args => this._watchHook(...args));
  }

  // does *not* update textOperations
  save (client, pathname, value, force = false) {
    let file = this.open(pathname);
    file.write(value, force);
    file.commit();
    this.emit('update');
    this._watchHook(client, pathname);
    return file;
  }

  // updates textOperations, meant to overwrite values
  overwrite (client, pathname, value) {
    let file = this.open(pathname);
    file.overwrite(value);
    file.commit();
    this.emit('update');
    this._watchHook(client, pathname);
    return file;
  }

};
