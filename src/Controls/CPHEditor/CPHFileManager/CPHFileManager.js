function CPHFileManager () {
  this.reset({});
};

CPHFileManager.prototype.TEMPORARY_PREFIX = '*:';

CPHFileManager.prototype.reset = function (files, isReconnecting) {
  this.files = files;
  if (!isReconnecting) {
    this.activeFile = null;
    this.loadingFiles = {};
    this.openFiles = {};
    this.openFilesList = [];
    this.openDirectories = {'': true};
    this.highlightedPathname = null;
  } else {
    this.loadingFiles = this.loadingFiles || {};
    this.openDirectories = this.openDirectories || {'': true};
    this.highlightedPathname = this.highlightedPathname || null;
    var activePathname = (this.activeFile && this.activeFile.pathname) || '';
    var openPathnames = this.openFilesList.map(function (file) { return file.pathname; });
    this.activeFile = null;
    this.openFiles = {};
    this.openFilesList = [];
    // We need to reassign to newly loaded files...
    openPathnames.forEach(function (pathname) {
      this.open(pathname, this.files[pathname], pathname !== activePathname);
    }.bind(this));
  }
};

CPHFileManager.prototype._sanitizePathname = function (pathname) {
  pathname = pathname || '';
  if (pathname.startsWith('/')) {
    pathname = pathname.slice(1);
  }
  if (pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }
  return pathname;
};

CPHFileManager.prototype.reassignUserUUID = function (fromUUID, toUUID) {
  this.openFilesList.forEach(function (file) {
    file.history && file.history.reassignUserUUID(fromUUID, toUUID);
  });
  return true;
};

CPHFileManager.prototype.isTemporary = function (pathname) {
  pathname = this._sanitizePathname(pathname);
  return !!(this.files[pathname] && this.files[pathname].tempPathname);
};

CPHFileManager.prototype.isModified = function (pathname) {
  pathname = this._sanitizePathname(pathname);
  return !!(this.files[pathname] && this.files[pathname].modified);
};

CPHFileManager.prototype.hasUnsavedChanges = function () {
  return Object.keys(this.files).filter(function (pathname) {
    return !!this.files[pathname].modified;
  }.bind(this)).length > 0;
};

CPHFileManager.prototype.getFormattedPathname = function (pathname) {
  if (this.isTemporary(pathname)) {
    return this.files[pathname].tempPathname;
  } else {
    return pathname;
  }
};

CPHFileManager.prototype.isReadOnly = function (pathname) {
  pathname = this._sanitizePathname(pathname);
  return !!(this.files[pathname] && this.files[pathname].readonly);
};

CPHFileManager.prototype.validatePathname = function (value, isTemp) {
  if (!value) {
    return 'Pathname must not be empty';
  } else if (value.startsWith('/')) {
    return 'Pathname must not start with "/"';
  } else if (value.endsWith('/')) {
    return 'Pathname must not end with "/"';
  } else if (value.endsWith('/.') || value === '.') {
    return 'Pathname must not end with "/."';
  } else if (value.trim() !== value) {
    return 'Pathname must not start or end with empty space';
  } else if (value.match(/\.\./gi)) {
    return 'Subpaths must not contain ..';
  } else if (value.match(/\/\.(\/|$)/gi)) {
    return 'Subpaths must not contain /./';
  } else if (!value.match(/^([^\/\*<>"']+\/)*[^\/\*<>"']+$/gi)) {
    return 'Subpaths must not be empty and must not contain *, <, >, \, \' or ".';
  } else if (!isTemp && this.exists(value)) {
    return 'File or directory already exists';
  } else {
    return true;
  }
};

CPHFileManager.prototype.openDirectory = function (pathname, force) {
  pathname = this._sanitizePathname(pathname);
  if (this.isDirectory(pathname) || force) {
    return this.openDirectories[pathname] = true;
  } else {
    return false;
  }
};

CPHFileManager.prototype.toggleDirectory = function (pathname) {
  pathname = this._sanitizePathname(pathname);
  if (this.isDirectory(pathname)) {
    if (this.openDirectories[pathname]) {
      delete this.openDirectories[pathname];
    } else {
      this.openDirectories[pathname] = true;
    }
    return !!this.openDirectories[pathname];
  } else {
    return false;
  }
};

CPHFileManager.prototype.isDirectoryOpen = function (pathname) {
  pathname = this._sanitizePathname(pathname);
  return !!this.openDirectories[pathname];
};

CPHFileManager.prototype.isHighlighted = function (pathname) {
  pathname = this._sanitizePathname(pathname);
  return this.highlightedPathname === pathname;
};

CPHFileManager.prototype.highlight = function (pathname) {
  if (pathname !== null) {
    pathname = this._sanitizePathname(pathname);
  }
  return this.highlightedPathname = pathname;
};

CPHFileManager.prototype.reorder = function (pathnames) {
  // Can reorder open files arbitrarily
  var activeFile = this.activeFile;
  var foundActive = false;
  this.openFilesList = pathnames
    .map(function (pathname) {
      var file = this.openFiles[pathname];
      if (activeFile === file) {
        foundActive = true;
      }
      return file || null;
    }.bind(this))
    .filter(function (file) {
      return !!file;
    });
  // We want openFiles to be equivalent to openFilesList
  this.openFiles = this.openFilesList.reduce(function (openFiles, file) {
    openFiles[file.pathname] = file;
    return openFiles;
  }, {});
  this.activeFile = foundActive
    ? activeFile
    : (this.openFilesList[0] || null);
  return this.activeFile;
};

CPHFileManager.prototype.swap = function (fromIndex, toIndex) {
  fromIndex = Math.max(0, Math.min(parseInt(fromIndex) || 0, this.openFilesList.length - 1));
  toIndex = Math.max(0, Math.min(parseInt(toIndex || 0), this.openFilesList.length));
  if (toIndex > fromIndex) {
    toIndex -= 1;
  }
  var file = this.openFilesList.splice(fromIndex, 1)[0];
  this.openFilesList.splice(toIndex, 0, file);
  return file;
};

CPHFileManager.prototype.update = function (files) {
  this.files = files;
  var activeFile = this.activeFile;
  this.openFilesList
    .filter(function (file) { return !this.files[file.pathname]; }.bind(this))
    .forEach(function (file) {
      this.close(file.pathname);
      if (file === activeFile) {
        activeFile = null;
      }
    }.bind(this));
  return this.activeFile = activeFile;
};

CPHFileManager.prototype.exists = function (pathname) {
  pathname = this._sanitizePathname(pathname);
  return !!this.files[pathname] ||
    Object.keys(this.files)
      .filter(function (key) { return key.startsWith(pathname + '/'); }).length > 0;
};

CPHFileManager.prototype.isDirectory = function (pathname) {
  pathname = this._sanitizePathname(pathname);
  return !this.files[pathname] && (
    (pathname === '') ||
    Object.keys(this.files)
      .filter(function (key) { return key.startsWith(pathname + '/'); }).length > 0
  );
};

CPHFileManager.prototype.isOpen = function (pathname) {
  pathname = this._sanitizePathname(pathname);
  return !!this.openFiles[pathname];
};

CPHFileManager.prototype.isLoading = function (pathname) {
  pathname = this._sanitizePathname(pathname);
  return !!this.loadingFiles[pathname];
};

CPHFileManager.prototype.loading = function (pathname, isLoading) {
  pathname = this._sanitizePathname(pathname);
  isLoading = !!isLoading;
  if (isLoading) {
    this.loadingFiles[pathname] = true;
  } else if (this.loadingFiles[pathname]) {
    delete this.loadingFiles[pathname];
  }
  return this.isLoading(pathname);
};

CPHFileManager.prototype.open = function (pathname, fileData, preventActive) {
  pathname = this._sanitizePathname(pathname);
  var isFileOpen = !!this.openFiles[pathname];
  var shouldOverwrite = !!fileData || !isFileOpen;
  var file;
  fileData = fileData || {};
  fileData = typeof fileData === 'object' ? fileData : {};
  fileData.value = fileData.value || '';
  fileData.value = typeof fileData.value === 'string'
    ? fileData.value.replace(/[\r]/gi, '')
    : fileData.value;
  fileData.type = fileData.type || 'text/plain';
  this.files[pathname] = this.files[pathname] ||
    {
      users: {},
      modified: false,
      tempPathname: fileData.tempPathname || null,
      readonly: false,
      type: fileData.type
    };
  if (shouldOverwrite) {
    if (typeof fileData.value === 'object' && fileData.value.hasOwnProperty('_base64')) {
      file = this.openFiles[pathname] = this.openFiles[pathname] || {};
      file.pathname = pathname;
      file.value = fileData.value;
      file.type = fileData.type;
      file.readonly = !!fileData.readonly;
      file.history = null;
    } else {
      fileData.value = typeof fileData.value === 'string' ? fileData.value : '';
      file = this.openFiles[pathname] = this.openFiles[pathname] || {};
      file.pathname = pathname;
      file.value = fileData.value;
      file.type = fileData.type;
      file.readonly = !!fileData.readonly;
      file.history = new CPHHistory(fileData.value);
    }
  } else {
    file = this.openFiles[pathname] = this.openFiles[pathname] || {};
    file.pathname = pathname;
    file.value = file.value || fileData.value;
    file.type = file.type || fileData.type;
    file.readonly = !!file.readonly || !!fileData.readonly;
    if (typeof file.value === 'object' && file.value.hasOwnProperty('_base64')) {
      file.history = null;
    } else {
      file.history = file.history || new CPHHistory(fileData.value);
    }
  }
  file.scroll = file.scroll || {x: 0, y: 0};
  if (!this.activeFile || !preventActive) {
    this.activeFile = file;
  }
  if (!isFileOpen) {
    this.openFilesList.push(file);
    if (file === this.activeFile) {
      var pathname = file.pathname;
      var paths = pathname.split('/').slice(0, -1);
      for (var i = 0; i < paths.length; i++) {
        var curPath = paths.slice(0, i + 1).join('/');
        if (this.isDirectory(curPath) && !this.isDirectoryOpen(curPath)) {
          this.toggleDirectory(curPath);
        }
      }
    }
  }
  return file;
};

CPHFileManager.prototype.close = function (pathname) {
  pathname = this._sanitizePathname(pathname);
  var file = this.openFiles[pathname];
  if (file) {
    var index = this.openFilesList.indexOf(file);
    this.openFilesList.splice(index, 1);
    delete this.openFiles[pathname];
    if (this.activeFile === file) {
      this.activeFile = this.openFilesList[Math.min(index, this.openFilesList.length - 1)] || null;
    }
  }
  return this.activeFile;
};

CPHFileManager.prototype.unlink = function (pathname) {
  pathname = this._sanitizePathname(pathname);
  Object.keys(this.files)
    .filter(function (filename) { return filename.startsWith(pathname); })
    .forEach(function (filename) {
      delete this.files[filename];
      this.close(filename);
    }.bind(this));
  return this.activeFile;
};

CPHFileManager.prototype.move = function (pathname, newPathname) {
  pathname = this._sanitizePathname(pathname);
  newPathname = this._sanitizePathname(newPathname);
  if (this.isHighlighted(pathname)) {
    this.highlight(newPathname);
  }
  var samePaths = [];
  var oldPaths = pathname.split('/').slice(0, -1);
  var newPaths = newPathname.split('/').slice(0, -1);
  var isFullyOpen = true;
  for (var i = 0; i < oldPaths.length; i++) {
    if (!this.isDirectoryOpen(oldPaths.slice(0, i + 1).join('/'))) {
      isFullyOpen = false;
      break;
    }
  }
  if (isFullyOpen) {
    for (var i = 0; i < newPaths.length; i++) {
      this.openDirectory(newPaths.slice(0, i + 1).join('/'), true);
    }
  }
  if (this.isDirectory(pathname)) {
    var movedSubdirs = {};
    var openDirectories = function (subPathname) {
      var paths = subPathname.split('/').slice(0, -1);
      for (var i = 0; i < paths.length; i++) {
        var checkSubpath = paths.slice(0, i + 1).join('/');
        if (!movedSubdirs[checkSubpath]) {
          if (this.isDirectoryOpen(pathname + '/' + checkSubpath)) {
            this.toggleDirectory(pathname + '/' + checkSubpath);
            this.openDirectory(newPathname + '/' + checkSubpath, true);
          }
          movedSubdirs[checkSubpath] = true;
        }
      }
    }.bind(this);
    Object.keys(this.files)
      .filter(function (key) { return key.startsWith(pathname + '/'); })
      .forEach(function (singlePathname) {
        var subPathname = singlePathname.slice((pathname + '/').length);
        openDirectories(subPathname);
        var newSinglePathname = newPathname + '/' + subPathname;
        if (this.isOpen(singlePathname)) {
          this.openFiles[newSinglePathname] = this.openFiles[singlePathname];
          this.openFiles[newSinglePathname].pathname = newSinglePathname;
          delete this.openFiles[singlePathname];
          this.files[newSinglePathname] = this.files[singlePathname];
          delete this.files[singlePathname];
        }
      }.bind(this));
    return true;
  } else if (this.isOpen(pathname)) {
    this.openFiles[newPathname] = this.openFiles[pathname];
    this.openFiles[newPathname].pathname = newPathname;
    this.files[newPathname] = this.files[pathname];
    if (newPathname !== pathname) {
      delete this.openFiles[pathname];
      delete this.files[pathname];
    }
    return true;
  } else {
    return false;
  }
};
