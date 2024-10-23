CPHEditor.prototype.syncClients = function () {
  this._syncQueue = this._syncQueue || {};
  var file = this.fileManager.activeFile;
  if (file && this.ws) {
    this._syncQueue[file.pathname] = true;
    file.value = this.value;
  }
  if (!this._syncTimeout) {
    var syncFiles = function () {
      this._syncTimeout = null;
      if (this.ws && this._reconnecting) {
        this._syncOnReconnect = true;
      } else if (this.ws) {
        Object.keys(this._syncQueue).forEach(function (pathname) {
          delete this._syncQueue[pathname];
          var file = this.fileManager.openFiles[pathname];
          if (file && file.history) {
            var textOperations = file.history.serializeClientTextOperations();
            if (
              textOperations.operations.add.length ||
              textOperations.operations.remove.length
            ) {
              this.__sendToFileServer(
                'client.filesystem.textoperations',
                {
                  pathname: pathname,
                  textOperations: textOperations
                }
              );
            }
          }
        }.bind(this));
      }
    }.bind(this);
    this._syncTimeout = setTimeout(syncFiles, 100);
  }
};

CPHEditor.prototype.reauthenticate = function (reauthProject) {
  if (!this.ws) {
    throw new Error('Can only reauthenticate when connected');
  } else if (reauthProject) {
    this.__sendToFileServer('client.project.reauthenticate', {});
  } else {
    this.__sendToFileServer('client.reauthenticate', {});
  }
};

CPHEditor.prototype.addNewFileOption = function (newFileOption) {
  this.fileTabs.addNewFileOption(newFileOption);
};

CPHEditor.prototype.setDirectoryEmptyFile = function (pathname, filename) {
  pathname = this.fileManager._sanitizePathname(pathname);
  this._directoryEmptyFiles.push({pathname: pathname, filename: filename});
  this._directoryEmptyFiles.sort(function (a, b) {
    return a.pathname > b.pathname ? 1 : -1;
  });
};

CPHEditor.prototype.swapOpenFiles = function (fromIndex, toIndex) {
  var file = this.fileManager.swap(fromIndex, toIndex);
  // FIXME: Populate TreeView needs to be automatic from fileManager activity
  this.treeView.populate(this.users, this.fileManager);
  this.fileTabs.populate(this.users, this.fileManager);
  this.openFile(file.pathname);
};

CPHEditor.prototype.uploadFiles = function (pathname) {
  pathname = pathname.split('/').slice(0, -1).join('/');
  var input = this.create('input', [], {type: 'file', multiple: true});
  var fileList = [];
  input.addEventListener('change', function (e) {
    var files = [].slice.call(e.target.files);
    var complete = function (file) {
      files.splice(files.indexOf(file), 1);
      if (!files.length && fileList.length) {
        if (this.ws) {
          this.__sendToFileServer(
            'client.filesystem.upload',
            {
              files: fileList
            }
          );
        } else {
          this.control('find-replace').hide();
          fileList.forEach(function (fileData) {
            var activeFile = this.fileManager.open(fileData.pathname, fileData);
            if (activeFile) {
              this.setReadOnly(activeFile.readonly);
              if (this.fileManager.isLoading(pathname)) {
                this.render(this.value = 0, true);
              } else if (activeFile.history) {
                this.__reconstituteValue(activeFile, activeFile.history.getLatestEntries(), true);
                activeFile.value = this.value;
              } else {
                this.render(this.value = activeFile, true);
              }
            } else {
              this.setReadOnly(false);
              this.render(this.value = null, true);
            }
          }.bind(this));
          // FIXME: Populate TreeView needs to be automatic from fileManager activity
          this.treeView.populate(this.users, this.fileManager);
          this.fileTabs.populate(this.users, this.fileManager);
        }
      }
    }.bind(this);
    files.forEach(function (file) {
      var reader = new FileReader();
      reader.addEventListener('error', function (err) {
        // FIXME: Error handling
        console.error('**Error reading file**\nCould not open `' + file.name +'`');
        complete(file);
      }.bind(this));
      reader.addEventListener('load', function() {
        var filePath = pathname + '/' + file.name;
        var result = CPHHelpers.isBinaryType(file.type)
          ? {pathname: filePath, value: {_base64: reader.result.split(',')[1]}, type: file.type}
          : {pathname: filePath, value: reader.result, type: file.type};
        fileList.push(result);
        complete(file);
      }.bind(this));
      CPHHelpers.isBinaryType(file.type)
        ? reader.readAsDataURL(file)
        : reader.readAsText(file);
    }.bind(this));
  }.bind(this));
  input.click();
};

CPHEditor.prototype.downloadFiles = function (pathname) {
  var pathnames = [pathname];
  var format = 'blob';
  if (pathname.startsWith('/')) {
    pathname = pathname.slice(1);
  }
  if (pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }
  if (pathname === '' || this.fileManager.isDirectory(pathname)) {
    pathnames = Object.keys(this.fileManager.files).filter(function (key) {
      return pathname
        ? key.startsWith(pathname + '/')
        : true;
    });
    format = 'tarball';
  }
  this.__sendToFileServer(
    'client.filesystem.download',
    {pathnames: pathnames, format: format, name: pathname}
  );
  this.onQueue('multiplayer.filesystem.download', function (ctrl, data) {
    var keys = Object.keys(data.files || {});
    var key = keys[0];
    var file = data.files && data.files[key];
    if (file) {
      var blob = CPHHelpers.base64ToBlob(file.value._base64, file.type);
      var url = window.URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.style = 'display: none';
      a.href = url;
      a.download = key.split('/').pop();
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }
  });
};

CPHEditor.prototype.openFile = function (pathname, fileData) {
  this.control('find-replace').hide();
  if (this.ws && !this.fileManager.isOpen(pathname)) {
    setTimeout(function () {
      this.fileManager.loading(pathname, true);
      this.fileManager.open(pathname);
      this.setReadOnly(false);
      this.render(this.value = 0, true);
      this.__sendToFileServer('client.filesystem.open', {pathname: pathname});
      // FIXME: Populate TreeView needs to be automatic from fileManager activity
      this.treeView.populate(this.users, this.fileManager);
      this.fileTabs.populate(this.users, this.fileManager);
    }.bind(this), 1);
  } else {
    if (!this.ws) {
      fileData = fileData || (
        this.fileManager.isOpen(pathname)
          ? void 0
          : { value: this.localFiles[pathname] }
      );
    }
    setTimeout(function () {
      var activeFile = this.fileManager.open(pathname, fileData);
      if (activeFile) {
        this.setReadOnly(activeFile.readonly);
        if (this.fileManager.isLoading(pathname)) {
          this.render(this.value = 0, true);
        } else if (activeFile.history) {
          this.__reconstituteValue(activeFile, activeFile.history.getLatestEntries(), true);
          activeFile.value = this.value;
        } else {
          this.render(this.value = activeFile, true);
        }
        if (this.ws) {
          this.__sendToFileServer('client.filesystem.activate', {pathname: activeFile.pathname});
        }
      } else {
        this.setReadOnly(false);
        this.render(this.value = null, true);
      }
      // FIXME: Populate TreeView needs to be automatic from fileManager activity
      this.treeView.populate(this.users, this.fileManager);
      this.fileTabs.populate(this.users, this.fileManager);
      this.dispatch(
        'file.active',
        this,
        {
          name: activeFile && this.fileManager.getFormattedPathname(activeFile.pathname),
          temporary: activeFile && this.fileManager.isTemporary(activeFile.pathname),
          file: activeFile
        }
      );
      this.dispatch(
        'file.status',
        this,
        {
          file: activeFile,
          data: activeFile && this.fileManager.files[activeFile.pathname]
        }
      );
      setTimeout(function () { this.focus(); }.bind(this));
    }.bind(this), 1);
  }
};

CPHEditor.prototype.closeFile = function (pathname, unlink) {
  if (this.ws) {
    if (unlink) {
      this.__sendToFileServer('client.filesystem.unlink', {pathname: pathname});
    } else {
      this.__sendToFileServer('client.filesystem.close', {pathname: pathname});
    }
  } else {
    // Local file management
    this.fileManager.files[pathname].modified = false;
    if (this.fileManager.files[pathname].tempPathname) {
      delete this.fileManager.files[pathname];
    }
  }
  var activeFile = unlink
    ? this.fileManager.unlink(pathname)
    : this.fileManager.close(pathname);
  if (activeFile) {
    this.setReadOnly(activeFile.readonly);
    if (activeFile.history) {
      this.__reconstituteValue(activeFile, activeFile.history.getLatestEntries(), true);
      activeFile.value = this.value;
    } else {
      this.render(this.value = activeFile, true);
    }
    if (this.ws) {
      this.__sendToFileServer('client.filesystem.activate', {pathname: activeFile.pathname});
    }
  } else {
    this.setReadOnly(false);
    this.render(this.value = null, true);
  }
  // FIXME: Populate TreeView needs to be automatic from fileManager activity
  this.treeView.populate(this.users, this.fileManager);
  this.fileTabs.populate(this.users, this.fileManager);
  this.dispatch(
    'file.active',
    this,
    {
      name: activeFile && this.fileManager.getFormattedPathname(activeFile.pathname),
      temporary: activeFile && this.fileManager.isTemporary(activeFile.pathname),
      file: activeFile
    }
  );
  this.dispatch(
    'file.status',
    this,
    {
      file: activeFile,
      data: activeFile && this.fileManager.files[activeFile.pathname]
    }
  );
  setTimeout(function () { this.focus(); }.bind(this));
};


CPHEditor.prototype.unlinkFile = function (pathname) {
  this.closeFile(pathname, true);
};

CPHEditor.prototype.parsePathname = function (pathname) {
  var value = pathname;
  if (value.startsWith('/')) {
    value = value.slice(1);
  }
  var filename = 'untitled';
  var name = filename;
  var ext = '';
  if (!value.endsWith('/')) {
    filename = value.split('/').pop();
    name = filename.split('.').slice(0, -1).join('.');
    ext = filename.split('.').pop();
    ext = ext ? '.' + ext : '';
  }
  value = value.split('/').slice(0, -1).join('/');
  value = value ? value + '/' : '';
  value = value;
  return {
    dirname: value,
    filename: filename,
    name: name,
    ext: ext
  };
};

CPHEditor.prototype.createFile = function (pathname, value, isDirectory) {
  if (pathname.startsWith(this.fileManager.TEMPORARY_PREFIX)) {
    if (this.ws) {
      this.__sendToFileServer(
        'client.filesystem.create',
        {
          pathname: pathname,
          value: value || ''
        }
      );
    } else {
      const ext = pathname.split('.').pop();
      const name = pathname.split('.').slice(0, -1).join('.');
      let i = 1;
      let filename = pathname;
      while (this.fileManager.exists(filename)) {
        i++;
        if (ext === name) {
          filename = `${name}-${i}`;
        } else {
          filename = `${name}-${i}.${ext}`;
        }
      }
      const tempPathname = pathname.slice(this.fileManager.TEMPORARY_PREFIX.length);
      this.openFile(filename, { tempPathname });
    }
  } else {
    var path = this.parsePathname(pathname);
    value = path.dirname + path.filename;
    selection = [path.dirname.length, value.length];
    var textInput = new CPHTextInput(
      this.app,
      {
        icon: isDirectory ? 'folder-plus' : 'file-plus',
        description: 'Enter your new ' + (isDirectory ? 'directory' : 'file') + ' name',
        placeholder: 'example-dir',
        selection: selection,
        value: value,
        validation: this.fileManager.validatePathname.bind(this.fileManager)
      }
    );
    textInput.on('submit', function (textInput, pathname) {
      if (this.ws) {
        if (isDirectory) {
          pathname = pathname + '/';
          var filename = '.empty';
          this._directoryEmptyFiles.forEach(function (entry) {
            if (pathname.startsWith(entry.pathname + '/')) {
              filename = entry.filename;
            }
          });
          pathname = pathname + filename;
        }
        this.__sendToFileServer(
          'client.filesystem.create',
          {
            pathname: pathname,
            value: ''
          }
        );
      }
      if (!isDirectory) {
        this.openFile(pathname);
      }
    }.bind(this));
    textInput.open(document.body);
  }
};

CPHEditor.prototype.copyFile = function (pathname, newPathname) {
  var isDirectory = this.fileManager.isDirectory(pathname);
  var isTemp = this.fileManager.isTemporary(pathname);
  var path = isTemp
    ? this.parsePathname(this.fileManager.files[pathname].tempPathname)
    : this.parsePathname(pathname);
  value = isDirectory
    ? path.dirname.slice(0, -1)
    : path.dirname + path.filename;
  selection = isDirectory
    ? [0, value.length]
    : [path.dirname.length, path.dirname.length + path.name.length];
  var onSubmit = function (pathname, newPathname) {
    if (this.ws) {
      this.__sendToFileServer(
        'client.filesystem.copy',
        {
          pathname: pathname,
          newPathname: newPathname,
          autoname: true,
          open: isTemp
        }
      );
    }
    if (!isDirectory && !isTemp) {
      this.openFile(newPathname);
    }
  }.bind(this);
  if (newPathname) {
    onSubmit(pathname, newPathname);
  } else {
    var textInput = new CPHTextInput(
      this.app,
      {
        icon: 'copy',
        description: isTemp
          ? 'Enter the duplicated temporary pathname for "' + value + '"'
          : 'Enter the duplicated pathname for "' + value + '"',
        placeholder: 'example.txt',
        selection: selection,
        value: value,
        validation: function (pathname) {
          return this.fileManager.validatePathname(pathname, isTemp);
        }.bind(this)
      }
    );
    textInput.on('submit', function (textInput, newPathname) {
      onSubmit(
        pathname,
        isTemp
          ? this.fileManager.TEMPORARY_PREFIX + newPathname
          : newPathname
      );
    }.bind(this));
    textInput.open(document.body);
  }
};

CPHEditor.prototype.moveFile = function (pathname, newPathname) {
  var isDirectory = this.fileManager.isDirectory(pathname);
  var isTemp = this.fileManager.isTemporary(pathname);
  var path = isTemp
    ? this.parsePathname(this.fileManager.files[pathname].tempPathname)
    : this.parsePathname(pathname);
  value = isDirectory
    ? path.dirname.slice(0, -1)
    : path.dirname + path.filename;
  selection = isDirectory
    ? [0, value.length]
    : [path.dirname.length, path.dirname.length + path.name.length];
  var onSubmit = function (pathname, newPathname) {
    if (this.ws) {
      this.__sendToFileServer(
        'client.filesystem.move.validate',
        {
          pathname: pathname,
          newPathname: newPathname,
        }
      );
    } else {
      this.fileManager.move(pathname, newPathname);
      this.dispatch('file.move', this, pathname, newPathname);
      // FIXME: Populate TreeView needs to be automatic from fileManager activity
      this.treeView.populate(this.users, this.fileManager);
      this.fileTabs.populate(this.users, this.fileManager);
    }
  }.bind(this);
  if (newPathname) {
    onSubmit(pathname, newPathname);
  } else {
    var textInput = new CPHTextInput(
      this.app,
      {
        icon: 'arrow-right',
        description: isTemp
          ? 'Enter the new temporary pathname for "' + value + '"'
          : 'Enter the new pathname for "' + value + '"',
        placeholder: 'example.txt',
        selection: selection,
        value: value,
        validation: function (pathname) {
          return this.fileManager.validatePathname(pathname, isTemp);
        }.bind(this)
      }
    );
    textInput.on('submit', function (textInput, newPathname) {
      onSubmit(
        pathname,
        isTemp
          ? this.fileManager.TEMPORARY_PREFIX + newPathname
          : newPathname
      );
    }.bind(this));
    textInput.open(document.body);
  }
};

CPHEditor.prototype.sendCustomEvent = function (eventName, eventPayload) {
  this.__sendToFileServer('client.custom.' + eventName, eventPayload);
};

CPHEditor.prototype.__sendToFileServer = function (eventName, data, force) {
  data = data || {};
  this._sendToFileServerQueue = this._sendToFileServerQueue || [];
  if (typeof eventName !== 'string') {
    throw new Error('"eventName" must be a string');
  } else if (typeof data !== 'object') {
    throw new Error('"data" must be an object');
  }
  if (!this.ws) {
    this.addSystemError('No connection to multiplayer established');
  } else if (force) {
    this.ws.send(JSON.stringify([eventName, data]));
  } else if (this._reconnecting) {
    this._sendToFileServerQueue.push([eventName, data]);
  } else if (this.ws.readyState === 0) {
    this._sendToFileServerQueue.push([eventName, data]);
  } else if (this.ws.readyState === 1) {
    this.ws.send(JSON.stringify([eventName, data]));
  } else if (this.ws.readyState === 2) {
    this._sendToFileServerQueue.push([eventName, data]);
    this.addSystemError('Connection to multiplayer closing');
  } else {
    this._sendToFileServerQueue.push([eventName, data]);
    this.addSystemError('Not connected to multiplayer');
  }
};

CPHEditor.prototype._fileServerEvents = {
  'error': function (data) {
    this.addSystemError('Error: ' + data.message);
  },
  'identify': function (data) {
    this.identifyCurrentUser(data.user);
  },
  'project.users.join': function (data) {
    this.identifyUsers(data.users);
    this.dispatch('multiplayer.project.users.active', this, {users: data.activeUsers});
    if (data.users.filter(function (user) { return user.uuid === this.user.uuid; }.bind(this)).length) {
      this.dispatch('multiplayer.user.refresh', this, {user: data.activeUsers});
    }
  },
  'project.users.quit': function (data) {
    this.identifyUsers(data.users);
    this.dispatch('multiplayer.project.users.active', this, {users: data.activeUsers});
  },
  'project.join': function (data) {
    var users = data.project.users;
    var files = data.project.files;
    this.identifyUsers(users, true);
    this.fileManager.reset(files, this._reconnecting);
    // FIXME: Populate TreeView needs to be automatic from fileManager activity
    this.treeView.populate(this.users, this.fileManager);
    this.fileTabs.populate(this.users, this.fileManager);
    this.dispatch('multiplayer.project.join', this, data);
  },
  'project.metadata.modified': function (data) {
    this.dispatch('multiplayer.project.metadata.modified', this, data);
  },
  'project.saving': function (data) {
    this.dispatch('multiplayer.saving', this, data);
  },
  'project.save.error': function (data) {
    this.addSystemError('Save error: ' + data.message);
    this._dequeueSaveCallbacks();
    this.dispatch('multiplayer.save.error', this, data);
  },
  'project.save.complete': function (data) {
    this._dequeueSaveCallbacks();
    this.dispatch('multiplayer.save.complete', this, data);
  },
  'filesystem.watch': function (data) {
    this.dispatch('multiplayer.file.watch', this, data);
  },
  'filesystem.status': function (data) {
    if (!this._reconnecting) { // ignore this if we're reconnecting
      // Make clientside modifications before updating file list
      var hasMoved = null;
      if (data.modifications) {
        if (data.modifications.move) {
          this.fileManager.move(data.modifications.move.pathname, data.modifications.move.newPathname);
          hasMoved = data.modifications.move;
        }
      }
      // A rename of tempPathname does not trigger a "move" event
      // But we should treat it as such from a frontend perspective
      var activeFile = this.fileManager.activeFile;
      var newActiveFile = this.fileManager.update(data.files);
      if (hasMoved && newActiveFile) {
        if (hasMoved.info) {
          newActiveFile.type = hasMoved.info.type;
        }
        delete newActiveFile.language;
      }
      if (hasMoved || newActiveFile !== activeFile) {
        if (newActiveFile) {
          this.setReadOnly(newActiveFile.readonly);
        }
        if (newActiveFile && newActiveFile.history) {
          this.__reconstituteValue(newActiveFile, newActiveFile.history.getLatestEntries(), true);
          newActiveFile.value = this.value;
        } else {
          this.render(this.value = newActiveFile, true);
        }
      } else {
        this.render(this.value, true);
      }
      // FIXME: Populate TreeView needs to be automatic from fileManager activity
      this.treeView.populate(this.users, this.fileManager);
      this.fileTabs.populate(this.users, this.fileManager);
      if (hasMoved) {
        this.dispatch('file.move', this, hasMoved.pathname, hasMoved.newPathname);
      }
      if (hasMoved || newActiveFile !== activeFile) {
        this.dispatch(
          'file.active',
          this,
          {
            name: newActiveFile && this.fileManager.getFormattedPathname(activeFile.pathname),
            temporary: newActiveFile && this.fileManager.isTemporary(activeFile.pathname),
            file: newActiveFile
          }
        );
      }
      this.dispatch(
        'file.status',
        this,
        {
          file: this.fileManager.activeFile,
          data: this.fileManager.activeFile && this.fileManager.files[this.fileManager.activeFile.pathname]
        }
      );
    }
  },
  'filesystem.open': function (data) {
    var fileData = data.file;
    this.fileManager.loading(fileData.pathname, false);
    var activeFile = this.fileManager.open(
      fileData.pathname,
      {
        value: fileData.value,
        type: fileData.type,
        readonly: fileData.readonly
      },
      !data.setActive
    );
    this.setReadOnly(activeFile && activeFile.readonly);
    var clientRevision = [-1, -1];
    if (fileData.textOperations) {
      clientRevision = this.__receiveTextOperations(fileData.pathname, fileData.textOperations, true);
    } else if (activeFile && activeFile.history) {
      this.__reconstituteValue(activeFile, activeFile.history.getLatestEntries(), true);
      activeFile.value = this.value;
    } else {
      this.render(this.value = activeFile, true);
    }
    this.__sendToFileServer(
      'client.filesystem.acknowledgerevision',
      {
        pathname: fileData.pathname,
        clientRevision: clientRevision
      }
    );
    if (!this._reconnecting) { // ignore this if we're reconnecting...
      // FIXME: Populate TreeView needs to be automatic from fileManager activity
      this.treeView.populate(this.users, this.fileManager);
      this.fileTabs.populate(this.users, this.fileManager);
      this.dispatch(
        'multiplayer.file.open',
        this,
        {
          file: activeFile,
          data: activeFile && this.fileManager.files[activeFile.pathname]
        }
      );
      this.dispatch(
        'file.active',
        this,
        {
          name: activeFile && this.fileManager.getFormattedPathname(activeFile.pathname),
          temporary: activeFile && this.fileManager.isTemporary(activeFile.pathname),
          file: activeFile
        }
      );
      this.dispatch(
        'file.status',
        this,
        {
          file: activeFile,
          data: activeFile && this.fileManager.files[activeFile.pathname]
        }
      );
      setTimeout(function () { this.focus(); }.bind(this));
    }
  },
  'filesystem.overwrite': function (data) {
    var fileData = data.file;
    var file = this.fileManager.open(
      fileData.pathname,
      {
        value: fileData.value,
        type: fileData.type,
        readonly: fileData.readonly
      },
      true
    );
    var activeFile = this.fileManager.activeFile;
    if (file === activeFile) {
      this.setReadOnly(activeFile.readonly);
    }
    var clientRevision = [-1, -1];
    if (fileData.textOperations) {
      clientRevision = this.__receiveTextOperations(fileData.pathname, fileData.textOperations, file === activeFile);
    } else if (file === activeFile) {
      this.render(this.value = activeFile);
    }
    this.__sendToFileServer(
      'client.filesystem.acknowledgerevision',
      {
        pathname: fileData.pathname,
        clientRevision: clientRevision
      }
    );
    // FIXME: Populate TreeView needs to be automatic from fileManager activity
    this.treeView.populate(this.users, this.fileManager);
    this.fileTabs.populate(this.users, this.fileManager);
    this.dispatch(
      'file.status',
      this,
      {
        file: activeFile,
        data: activeFile && this.fileManager.files[activeFile.pathname]
      }
    );
  },
  'filesystem.download': function (data) {
    this.dispatch('multiplayer.filesystem.download', this, data);
    this.dispatch('multiplayer.filesystem.download.' + data.format, this, data);
  },
  'filesystem.refresh': function (data) {
    // reorder files based on what's supposed to be open...
    var activeFile = this.fileManager.reorder(data.pathnames);
    if (activeFile) {
      this.setReadOnly(activeFile.readonly);
      if (activeFile.history) {
        this.__reconstituteValue(activeFile, activeFile.history.getLatestEntries(), true);
        activeFile.value = this.value;
      } else {
        this.render(this.value = activeFile, true);
      }
    } else {
      this.setReadOnly(false);
      this.render(this.value = null, true);
    }
    // FIXME: Populate TreeView needs to be automatic from fileManager activity
    this.treeView.populate(this.users, this.fileManager);
    this.fileTabs.populate(this.users, this.fileManager);
    this.dispatch(
      'multiplayer.file.open',
      this,
      {
        file: activeFile,
        data: activeFile && this.fileManager.files[activeFile.pathname]
      }
    );
    this.dispatch(
      'file.active',
      this,
      {
        name: activeFile && this.fileManager.getFormattedPathname(activeFile.pathname),
        temporary: activeFile && this.fileManager.isTemporary(activeFile.pathname),
        file: activeFile
      }
    );
    this.dispatch(
      'file.status',
      this,
      {
        file: activeFile,
        data: activeFile && this.fileManager.files[activeFile.pathname]
      }
    );
    setTimeout(function () { this.focus(); }.bind(this));
  },
  'filesystem.textoperations': function (data) {
    var clientRevision = this.__receiveTextOperations(data.pathname, data.textOperations);
    this.__sendToFileServer(
      'client.filesystem.acknowledgerevision',
      {
        pathname: data.pathname,
        clientRevision: clientRevision
      }
    );
  },
  'filesystem.modified': function (data) {
    if (data.modified !== this.fileManager.files[data.pathname].modified) {
      this.fileManager.files[data.pathname].modified = data.modified;
      // FIXME: Populate TreeView needs to be automatic from fileManager activity
      this.treeView.populate(this.users, this.fileManager);
      this.fileTabs.populate(this.users, this.fileManager);
    }
    if (this.fileManager.activeFile && data.pathname === this.fileManager.activeFile.pathname) {
      this.dispatch(
        'file.status',
        this,
        {
          file: this.fileManager.activeFile,
          data: this.fileManager.files[data.pathname]
        }
      );
    }
  },
  'filesystem.acknowledged': function (data) {
    this.mpLog('Server knows client is at: ', data.pathname, data.clientRevision);
  },
  'filesystem.move.validate': function (data) {
    // Only warn if we're switching from binary to non-binary
    if (
      data.validate.pathname.isBinaryType &&
      !data.validate.newPathname.isBinaryType
    ) {
      var message = [
        'Are you sure you want to change the file type from binary type ',
        '"' + data.validate.pathname.type + '" ',
        'to text type ',
        '"' + data.validate.newPathname.type + '"? ',
        'This could result in corruption of data due to the way text files ',
        'are processed.'
      ].join('');
      var confirm = new CPHConfirm(this.app, {message: message});
      confirm.open(this.app ? this.app.element() : document.body);
      confirm.on('ok', function () {
        this.__sendToFileServer(
          'client.filesystem.move',
          {
            pathname: data.pathname,
            newPathname: data.newPathname,
            autoname: true
          }
        );
      }.bind(this));
    } else {
      this.__sendToFileServer(
        'client.filesystem.move',
        {
          pathname: data.pathname,
          newPathname: data.newPathname,
          autoname: true
        }
      );
    }
  }
};

CPHEditor.prototype.addSystemError = function (message) {
  this._systemErrors.push({message: message});
  this._renderSystemErrors();
};

CPHEditor.prototype.clearSystemError = function (index) {
  this._systemErrors.splice(index, 1);
  this._renderSystemErrors();
};

CPHEditor.prototype._renderSystemErrors = function () {
  var systemErrorEl = this.selector('.system-error');
  if (this._systemErrors.length) {
    systemErrorEl.classList.add('visible');
    systemErrorEl.innerHTML = this._systemErrors.map(function (err, i) {
      return '<div class="error-row" data-error-index="' + i + '">' +
        CPHHelpers.safeHTML(err.message) +
        '<span class="close"></span>' +
        '</div>';
    }).join('');
  } else {
    systemErrorEl.classList.remove('visible');
  }
};

CPHEditor.prototype._renderReconnection = function (message) {
  var systemReconnectEl = this.selector('.system-reconnect');
  if (message) {
    this.element().classList.add('reconnecting');
    systemReconnectEl.innerHTML = [
      '<div class="error-row">',
        CPHHelpers.safeHTML(message),
      '</div>'
    ].join('');
  } else {
    this.element().classList.remove('reconnecting');
  }
};

CPHEditor.prototype._retrieveWebsocketURL = function (hostname, params, verificationParams, callback) {
  var xhr = new XMLHttpRequest();
  xhr.addEventListener('error', (function () {
    return callback(new Error('Could not retrieve your project: HTTP request failed'));
  }).bind(this));
  xhr.addEventListener('abort', (function () {
    return callback(new Error('Could not retrieve your project: HTTP request aborted'));
  }).bind(this));
  xhr.addEventListener('load', (function () {
    var text = xhr.responseText;
    var json;
    var error;
    try {
      json = JSON.parse(text);
    } catch (e) {
      error = new Error('Could not retrieve your project, invalid response: "' + text + '"');
    }
    if (xhr.status !== 200) {
      return callback(
        error
          ? new Error(text)
          : new Error(
              json.meta.error
                ? json.meta.error.message
                : text
            )
      );
    } else {
      return callback(null, [json.websocket_url, queryString].join('?'));
    }
  }).bind(this));
  var queryString = Object.keys(params).map(function (key) {
    return [key, params[key] || ''].map(encodeURIComponent).join('=')
  }).join('&');
  xhr.open('POST', hostname + ['/projects/open', queryString].join('?'));
  if (verificationParams && verificationParams.bearer) {
    xhr.setRequestHeader('Authorization', 'Bearer ' + verificationParams.bearer);
  }
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.send(null);
};

CPHEditor.prototype.disconnectFromFileServer = function () {
  this._destroySocket();
  this.ws && this.ws.close();
  this.ws = null;
};

CPHEditor.prototype._reconnectToFileServer = function (hostname, queryParams, verificationParams, count) {
  // If user was customizing query params we want a clean open.
  // This could include templates, forking, etc so just clear it --
  // it's a reconnect
  this._reconnecting = true;
  var newQueryParams = {
    project: queryParams.project,
    reconnect: true
  };
  count = parseInt(count) || 0;
  this._systemErrors = [];
  this._renderSystemErrors();
  this._renderReconnection('Reconnecting...');
  this.connectToFileServer(hostname, newQueryParams, verificationParams, function (err) {
    if (err) {
      if (err.message && err.message.match(/not found/gi)) {
        this._reconnecting = false;
        this._renderReconnection();
        this.addSystemError('You do not have permission to access this project');
      } else {
        var t = Math.min(30, 5 + (count * 2));
        var interval = setInterval(function () {
          if (t <= 0) {
            clearInterval(interval);
            this._reconnectToFileServer(hostname, newQueryParams, verificationParams, count + 1);
          } else {
            this._renderReconnection('Reconnection failed, trying again in ' + (t--) + '...');
          }
        }.bind(this), 1000);
      }
    } else {
      this._reconnecting = false;
      this._renderReconnection();
      if (this._syncOnReconnect) {
        delete this._syncOnReconnect;
        this.syncClients();
      }
    }
  }.bind(this));
};

CPHEditor.prototype.connectToFileServer = function (hostname, queryParams, verificationParams, callback, retryCount) {
  queryParams = queryParams || {};
  verificationParams = verificationParams || {};
  callback = typeof callback === 'function' ? callback : function () {};
  var connectCallback = function (err) {
    callback.apply(this, arguments);
    if (!err) {
      while (
        this._sendToFileServerQueue &&
        this._sendToFileServerQueue.length
      ) {
        var args = this._sendToFileServerQueue.shift();
        this.__sendToFileServer(args[0], args[1], true);
      }
      this._sendToFileServerQueue = null;
    }
  }.bind(this);
  this._retrieveWebsocketURL(
    hostname,
    queryParams,
    verificationParams,
    function (err, websocketURL) {
      if (err) {
        return connectCallback(err);
      } else {
        this._createSocket(
          websocketURL,
          verificationParams,
          connectCallback,
          function () {
            this._reconnectToFileServer(hostname, queryParams, verificationParams);
          }.bind(this),
          function (retryCount) {
            this.connectToFileServer(hostname, queryParams, verificationParams, callback, retryCount);
          }.bind(this),
          retryCount
        );
        if (!queryParams.reconnect) {
          this.setReadOnly(false);
          this.render(this.value = null);
        }
      }
    }.bind(this)
  )
};

CPHEditor.prototype._destroySocket = function () {
  this._socketWindowEvents = this._socketWindowEvents || {};
  Object.keys(this._socketWindowEvents).forEach(function (key) {
    window.removeEventListener(key, this._socketWindowEvents[key]);
    delete this._socketWindowEvents[key];
  }.bind(this));
  if (this.ws) {
    this._socketEvents = this._socketEvents || {};
    Object.keys(this._socketEvents).forEach(function (key) {
      this.ws.removeEventListener(key, this._socketEvents[key]);
      delete this._socketEvents[key];
    }.bind(this));
  }
};

CPHEditor.prototype._createSocket = function (
  connectionString, verificationParams,
  connectCallback, reconnectCallback, retryCallback, retryCount
) {
  var MAX_RETRY_COUNT = 5;
  retryCount = Math.max(0, parseInt(retryCount) || 0);
  this._destroySocket();
  var WebSocket = window['WebSocket'] || window['MozWebSocket'];
  var initialized = false;
  var connectionFailed = false;
  var chunks = {};
  var ws = this.ws = new WebSocket(connectionString);
  this._socketWindowEvents = {
    'offline': function () {
      this._destroySocket();
      this.ws.close();
      if (!initialized) {
        if (!connectionFailed) {
          connectionFailed = true;
          this.dispatch('multiplayer.connection.error', this, new Error('Browser went offline'));
          return connectCallback(new Error('Browser went offline'));
        }
      } else {
        reconnectCallback();
      }
    }.bind(this)
  };
  this._socketEvents = {
    'open': function () {
      if (!initialized) {
        this.mpLog('Socket connection established to: ' + connectionString);
        this.__sendToFileServer('verify', verificationParams, true);
        this.onNext('multiplayer.project.join', function (ctrl, projectData) {
          if (ws === this.ws) {
            this.mpLog('Project joined: ' + projectData.project.name);
            if (!initialized) {
              if (!projectData.openFile && !projectData.reconnect) {
                initialized = true;
                this.dispatch('multiplayer.connect', this, projectData.project, null);
                return connectCallback(null, this, projectData.project, null);
              } else if (!projectData.reconnect) {
                this.onNext('multiplayer.file.open', function (ctrl, data) {
                  if (ws === this.ws) {
                    initialized = true;
                    if (data.file) {
                      this.mpLog('Project file opened: ' + data.file.pathname);
                    }
                    this.dispatch('multiplayer.connect', this, projectData.project, data.file);
                    return connectCallback(null, this, projectData.project, data.file);
                  }
                }.bind(this));
              } else {
                // if we're reconnecting, let the server know which files
                // we had open
                var pathnames = this.fileManager.openFilesList.map(function (file) {
                  return file.pathname;
                });
                this.__sendToFileServer(
                  'client.filesystem.refresh',
                  {pathnames: pathnames},
                  true
                );
                // multiplayer.refresh from server will trigger this
                this.onNext('multiplayer.file.open', function (ctrl, data) {
                  if (ws === this.ws) {
                    initialized = true;
                    if (data.file) {
                      this.mpLog('Reconnected and project file opened: ' + data.file.pathname);
                    }
                    this.dispatch('multiplayer.connect', this, projectData.project, data.file);
                    return connectCallback(null, this, projectData.project, data.file);
                  }
                }.bind(this));
              }
            }
          }
        }.bind(this));
        return;
      } else {
        this.mpLog('Socket reconnected to: ' + connectionString);
        return;
      }
    }.bind(this),
    'error': function (errorEvent) {
      this._destroySocket();
      this.addSystemError('Connection error');
      if (!initialized) {
        if (!connectionFailed) {
          connectionFailed = true;
          this.dispatch('multiplayer.connection.error', this, new Error('Connection failed'));
          return connectCallback(new Error('Connection failed'));
        }
      } else {
        reconnectCallback();
      }
    }.bind(this),
    'close': function (closeEvent) {
      this._destroySocket();
      this.addSystemError('Connection closed unexpectedly');
      if (!initialized) {
        if (!connectionFailed) {
          connectionFailed = true;
          this.dispatch('multiplayer.connection.error', this, new Error('Connection closed unexpectedly'));
          return connectCallback(new Error('Connection closed unexpectedly'));
        }
      } else {
        reconnectCallback();
      }
    }.bind(this),
    'message': function (event) {
      this.mpLog('CONNECTION RECEIVE :: ', event);
      var data = event.data;
      try {
        data = JSON.parse(event.data);
      } catch (e) {
        throw new Error('Invalid data from server: "' + event.data + '"');
      }
      var eventName = data[0];
      var eventPayload = data[1];
      // deal with chunked responses from server...
      if (eventName === 'ping') {
        this.__sendToFileServer('pong', eventPayload, true);
        return;
      } else if (eventName === 'chunk') {
        chunks[eventPayload.uuid] = chunks[eventPayload.uuid] || Array(eventPayload.length).fill(null);
        chunks[eventPayload.uuid][eventPayload.index] = eventPayload.message;
        if (chunks[eventPayload.uuid].indexOf(null) > -1) {
          return; // quick empty from a chunked response
        } else {
          data = chunks[eventPayload.uuid].join('');
          delete chunks[eventPayload.uuid];
          try {
            data = JSON.parse(data);
          } catch (e) {
            throw new Error('Invalid chunked data from server: "' + data + '"');
          }
          eventName = data[0];
          eventPayload = data[1];
        }
      }
      if (eventName === 'error' && !initialized && !connectionFailed) {
        this._destroySocket();
        connectionFailed = true;
        let error = new Error(eventPayload.message);
        eventPayload.statusCode && (error.statusCode = eventPayload.statusCode);
        eventPayload.details && (error.details = eventPayload.details);
        if (eventPayload.message.startsWith('Host validation failed')) {
          if (retryCount >= MAX_RETRY_COUNT) {
            error.message = eventPayload.message + ' (' + retryCount + ' retries)';
            this.dispatch('multiplayer.connection.error', this, error);
            return connectCallback(error);
          } else {
            // If host validation fails, keep retrying...
            return retryCallback(retryCount + 1);
          }
        } else {
          this.dispatch('multiplayer.connection.error', this, error);
          return connectCallback(error);
        }
      } else if (eventName.startsWith('custom.')) {
        this.dispatch('multiplayer.' + eventName, this, eventPayload);
      } else if (!this._fileServerEvents[eventName]) {
        throw new Error('Unhandled event name from server: "' + eventName + '"');
      } else {
        this._fileServerEvents[eventName].call(this, eventPayload);
      }
    }.bind(this)
  };
  Object.keys(this._socketWindowEvents).forEach(function (key) {
    window.addEventListener(key, this._socketWindowEvents[key]);
  }.bind(this));
  Object.keys(this._socketEvents).forEach(function (key) {
    this.ws.addEventListener(key, this._socketEvents[key]);
  }.bind(this));
  return this.ws;
};

CPHEditor.prototype.__receiveTextOperations = function (pathname, textOperations, reload) {
  var file = this.fileManager.openFiles[pathname];
  if (!file) {
    throw new Error('Could not find open file for receiving TextOperations: "' + pathname + '"');
  } else {
    var entries = reload
      ? file.history.loadServerTextOperations(textOperations)
      : file.history.readServerTextOperations(textOperations);
    if (entries) {
      file.value = this.__reconstituteValue(file, entries, file === this.fileManager.activeFile);
    }
    return file.history.clientRevision;
  }
};

CPHEditor.prototype.__reconstituteValue = function (file, entries, callRender) {
  var value = '';
  var cachedCursors = {};
  if (entries[0]) {
    value = entries[0].value;
    this.users.forEach(function (user) {
      cachedCursors[user.uuid] = user.exportCursors();
      var cursors = entries[0].cursorMap && entries[0].cursorMap[user.uuid];
      if (cursors && cursors.length) {
        user.loadCursors(cursors);
      }
    });
  }
  for (var i = 0; i < entries.length; i++) {
    var userAction = entries[i];
    var user = this.getUser(userAction.user_uuid);
    value = this._userAction.apply(
      this,
      [].concat(file, user, userAction.name, userAction.args, value, false, userAction.uuid)
    );
  }
  if (callRender) {
    this.value = value;
    this.scrollTo(file.scroll.x, file.scroll.y, true);
    this.render(this.value, true);
    return value;
  } else {
    // We want to reset cursors to existing file
    // So that they don't jump around in file we're editing
    // if textOperations aren't from current file
    this.users.forEach(function (user) {
      if (cachedCursors[user.uuid]) {
        user.loadCursors(cachedCursors[user.uuid]);
      }
    });
    return value;
  }
};

CPHEditor.prototype.mpLog = function () {
  if (this.mpdebug) {
    console.log.apply(console.log, ['[MP LOG]'].concat([].slice.call(arguments)));
  }
};
