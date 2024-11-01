function CPHTreeView (app, cfg) {

  this.app = app;
  this.selectedIndex = -1;
  this.items = [];
  this._contextMenu = null;
  this._highlight = null;

  this.editor = cfg.editor;

  if (!(this.editor instanceof CPHEditor)) {
    throw new Error('Must provide "editor" as CPHEditor');
  }

  this._drag = null;
  this._dragDistance = 5; // drag distance in pixels...

  this._dropPathname = null;
  this._dropAction = null;

  this._rootName = '(root)';
  this._rootIcon = '';

  this._lastUsers = null // Set after populated
  this.fileManager = null; // Set after populated

  this._formatter = function (pathname, filename, isDirectory) { return null; };

  Control.call(this);

  this.populate();

};

CPHTreeView.prototype = Object.create(Control.prototype);
CPHTreeView.prototype.constructor = CPHTreeView;
CPHTreeView.prototype.controlName = 'CPHTreeView';
window.Controls['CPHTreeView'] = CPHTreeView;

CPHTreeView.prototype.eventListeners = {
  'div.files': {
    contextmenu: function capture (e, el) {
      if (e.metaKey || (!CPHHelpers.isMac() && e.ctrlKey)) {
        return;
      }
      var fileInfo = this._getFileInfoFromElement(e.target);
      this.fileManager && this.fileManager.highlight(fileInfo.pathname);
      var metadata = this.fileManager && this.fileManager.files[fileInfo.pathname];
      var isTemp = this.fileManager.isTemporary(fileInfo.pathname);
      var isReadOnly = this.fileManager.isReadOnly(fileInfo.pathname);
      fileInfo.element.classList.add('highlight');
      this._contextMenu = new CPHContextMenu(
        this.app,
        {
          parent: this,
          data: {
            pathname: fileInfo.pathname,
            isDirectory: fileInfo.isDirectory
          },
          items: [
            {
              icon: 'file-plus',
              title: 'New File',
              action: function (data) {
                this.dispatch('file.create', this, isTemp ? '/' : data.pathname);
              }.bind(this)
            },
            {
              icon: 'folder-plus',
              title: 'New Folder',
              action: function (data) {
                this.dispatch('directory.create', this, isTemp ? '/' : data.pathname);
              }.bind(this)
            },
            '-',
            {
              icon: 'edit-2',
              title: 'Rename',
              disabled: fileInfo.pathname === '/' || isReadOnly,
              action: function (data) {
                this.dispatch('move', this, data.pathname);
              }.bind(this)
            },
            {
              icon: 'copy',
              title: 'Duplicate',
              disabled: fileInfo.pathname === '/',
              action: function (data) {
                this.dispatch('copy', this, data.pathname);
              }.bind(this)
            },
            {
              icon: 'trash',
              title: 'Delete',
              disabled: fileInfo.pathname === '/' || isReadOnly,
              action: function (data) {
                this.dispatch('unlink', this, data.pathname);
              }.bind(this)
            },
            '-',
            {
              icon: 'upload',
              title: 'Upload files',
              action: function (data) {
                this.dispatch('upload', this, data.pathname);
              }.bind(this)
            },
            {
              icon: (fileInfo.isDirectory ? 'download' : 'download'),
              title: (fileInfo.isDirectory ? 'Download Folder' : 'Download File'),
              hidden: !this.editor.ws,
              action: function (data) {
                this.dispatch('download', this, data.pathname);
              }.bind(this)
            },
            {
              icon: 'download-cloud',
              title: 'Download Project',
              hidden: !this.editor.ws,
              action: function (data) {
                this.dispatch('download', this, '/');
              }.bind(this)
            }
          ]
        }
      );
      this._contextMenu.open(e);
      this._contextMenu.on('close', function () {
        this._contextMenu = null;
        this.fileManager && this.fileManager.highlight(null);
        fileInfo.element.classList.remove('highlight');
      }.bind(this));
    },
    click: function (e, el) {
      var fileInfo = this._getFileInfoFromElement(e.target);
      if (fileInfo) {
        if (fileInfo.isDirectory) {
          var dirGroupEl = fileInfo.element.parentNode;
          var isOpen = !!(this.fileManager && this.fileManager.toggleDirectory(fileInfo.pathname));
          dirGroupEl.setAttribute('data-open', isOpen);
        } else {
          var selectedIndex = this.items.indexOf(fileInfo.pathname);
          if (selectedIndex !== this.selectedIndex) {
            this.selectedIndex = selectedIndex;
            this.dispatch('select', this, fileInfo.pathname);
          }
        }
      }
    },
    mousedown: function capture (e, el) {
      var fileInfo = this._getFileInfoFromElement(e.target);
      var paths = fileInfo.pathname.split('/');
      var filename = paths.pop() || paths.pop(); // if empty, go one layer lower
      var metadata = !fileInfo.isDirectory &&
        this.fileManager && this.fileManager.files[fileInfo.pathname];
      var canDrag = (fileInfo.isDirectory || !metadata.tempPathname) &&
        !this.fileManager.isReadOnly(fileInfo.pathname);
      if (filename && canDrag) {
        this._drag = {
          pathname: fileInfo.pathname,
          filename: filename,
          isDirectory: fileInfo.isDirectory,
          x: e.clientX,
          y: e.clientY,
          valid: true,
          element: null
        };
      }
    },
    mouseenter: function (e, el) {
      if (this._drag) {
        this._drag.valid = true;
      }
    },
    mouseleave: function (e, el) {
      if (this._drag) {
        this._drag.valid = false;
      }
    }
  }
};

CPHTreeView.prototype.windowEvents = {
  mousemove: function (e) {
    if (this._drag) {
      if (!this._drag.element) {
        var dx = e.clientX - this._drag.x;
        var dy = e.clientY - this._drag.y;
        var d = Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2));
        if (d > this._dragDistance) {
          this._drag.element = this.create('div', ['treeview-dragging'], {style: 'position: absolute; z-index: 999;'});
          this._drag.element.innerHTML = [
            '<span class="icon move">',
              feather.icons['arrow-right'].toSvg(),
            '</span>',
            '<span class="icon copy">',
              feather.icons['copy'].toSvg(),
            '</span>',
            '<span class="icon ' + (this._drag.isDirectory ? 'folder' : '') + '">',
            this._drag.isDirectory
              ? feather.icons['folder'].toSvg()
              : feather.icons['file'].toSvg(),
            '</span>',
            '<span class="name">',
              this._drag.filename,
            '</span>'
          ].join('');
          document.body.appendChild(this._drag.element);
          document.documentElement.style.setProperty('cursor', 'grabbing');
          document.body.style.setProperty('pointer-events', 'none');
        }
      }
      if (this._drag.element) {
        this._drag.element.style.left = e.clientX + 'px';
        this._drag.element.style.top = e.clientY + 'px';
        document.body.style.setProperty('pointer-events', '');
        var targetEl = document.elementFromPoint(e.clientX, e.clientY);
        document.body.style.setProperty('pointer-events', 'none');
        var fileInfo = this._getFileInfoFromElement(targetEl);
        var el = this.element();
        el.querySelectorAll('[data-drop]').forEach(function (el) {
          el.removeAttribute('data-drop');
        });
        this._dropPathname = null;
        this._dropAction = null;
        if (fileInfo) {
          var pathname = fileInfo.pathname;
          if (!pathname.endsWith('/')) {
            // if it's a file, use the extended pathname
            pathname = pathname.split('/').slice(0, -1).join('/') + '/';
            if (!pathname.startsWith('/')) {
              pathname = '/' + pathname;
            }
          }
          this._dropPathname = pathname;
          if (this._drag.isDirectory) {
            if (
              pathname === this._drag.pathname ||
              pathname === this._drag.pathname.split('/').slice(0, -2).join('/') + '/'
            ) {
              this._dropPathname = null;
              this._dropAction = null;
            } else if (pathname.startsWith(this._drag.pathname)) {
              this._dropAction = 'copy';
            } else {
              this._dropAction = 'move';
            }
          } else if (
            !this._drag.isDirectory &&
            this._drag.pathname.slice(0, this._drag.pathname.lastIndexOf('/') + 1) === pathname.slice(1)
          ) {
            this._dropPathname = null;
            this._dropAction = null;
          } else {
            this._dropAction = 'move';
          }
        }
        this._drag.element.setAttribute('data-drop-action', this._dropAction);
        if (this._dropAction === 'move') {
          document.documentElement.style.setProperty('cursor', 'alias');
        } else if (this._dropAction === 'copy') {
          document.documentElement.style.setProperty('cursor', 'copy');
        } else {
          document.documentElement.style.setProperty('cursor', 'grabbing');
        }
        if (this._dropPathname) {
          this.selector('[data-root="' + pathname + '"]').setAttribute('data-drop', true);
        }
      }
    }
  },
  mouseup: function (e) {
    if (this._drag) {
      if (this._drag.element) {
        this._drag.element.parentNode && this._drag.element.parentNode.removeChild(this._drag.element);
        document.documentElement.style.setProperty('cursor', '');
        document.body.style.setProperty('pointer-events', '');
        var el = this.element();
        el.querySelectorAll('[data-drop]').forEach(function (el) {
          el.removeAttribute('data-drop');
        });
        if (this._dropAction) {
          var dropPathname = this._dropPathname + this._drag.filename;
          this.fileManager.openDirectory(this._dropPathname);
          this.dispatch(this._dropAction, this, this._drag.pathname, dropPathname);
        }
      }
      this._drag = null;
      this._dropPathname = null
      this._dropAction = null;
    }
  },
  blur: function (e) {
    if (this._drag) {
      this._drag = null;
      this._dropPathname = null
      this._dropAction = null;
    }
  }
};

CPHTreeView.prototype._getFileInfoFromElement = function (targetEl) {
  var baseEl = this.selector('div.files');
  while (
    targetEl &&
    targetEl.classList &&
    !targetEl.classList.contains('selectable') &&
    targetEl !== baseEl
  ) {
    targetEl = targetEl.parentNode;
  }
  var checkEl = targetEl;
  while (checkEl && checkEl !== baseEl) {
    checkEl = checkEl.parentNode;
  }
  if (!checkEl) {
    return null;
  } else if (targetEl === baseEl) {
    return {
      pathname: '/',
      isDirectory: true,
      element: this.selector('[data-root="/"]')
    };
  } else if (!targetEl || !targetEl.classList) {
    return null;
  } else {
    if (targetEl.classList.contains('file') && targetEl.hasAttribute('data-index')) {
      var selectedIndex = (targetEl.getAttribute('data-index') | 0);
      return {
        pathname: this.items[selectedIndex],
        isDirectory: false,
        element: targetEl
      };
    } else if (targetEl.classList.contains('directory')) {
      var dirGroupEl = targetEl.parentNode;
      var root = dirGroupEl.getAttribute('data-root');
      return {
        pathname: root,
        isDirectory: true,
        element: targetEl
      };
    } else {
      return null;
    }
  }
};

CPHTreeView.prototype.redraw = function () {
  this.populate(this._lastUsers, this.fileManager);
};

CPHTreeView.prototype.populate = function (users, fileManager) {

  users = users || [];

  var items = [];
  var pathname = null;

  if (fileManager) {
    this.fileManager = fileManager;
    items = Object.keys(fileManager.files);
    pathname = fileManager.activeFile && fileManager.activeFile.pathname;
  }

  items = Array.isArray(items) ? items : [];
  var tree = this.__createTree('', items.slice());
  var fileListEl = this.selector('div.files');

  this.items = [];
  fileListEl.innerHTML = '';
  fileListEl.appendChild(this.__renderTree(users, fileManager, tree, this.items));
  if (pathname !== null) {
    var selectedIndex = this.items.indexOf(pathname);
    this.selectedIndex = selectedIndex > -1 ? selectedIndex : this.selectedIndex;
  } else {
    this.selectedIndex = -1;
  }
  var el = fileListEl.querySelector('[data-index="' + this.selectedIndex + '"]');
  el && el.setAttribute('data-selected', '');
  while (
    el &&
    el.parentNode.classList.contains('directory-group')
  ) {
    el = el.parentNode;
    el.setAttribute('data-selected', '');
  }

  this._lastUsers = users;
  this.fileManager = fileManager;

};

CPHTreeView.prototype.__createTree = function (root, items) {
  root = root || '',
  root = root.startsWith('/') ? root : '/' + root;
  root = root.endsWith('/') ? root : root + '/';
  items = items.sort(function (a, b) { return a > b ? 1 : -1; });
  var depth = root.split('/').length - 1;
  var node = {
    root: root,
    name: root.split('/').slice(0, -1).pop(),
    directories: [],
    files: []
  };
  var aggregator = items.reduce(function (aggregator, pathname) {
    var paths = pathname.split('/');
    var filename = paths.slice().pop();
    if (paths.length > depth) {
      var curRoot = paths.slice(0, depth).join('/');
      if (curRoot === aggregator.lastRoot) {
        aggregator.items.push(pathname);
      } else {
        if (aggregator.items.length) {
          node.directories.push(this.__createTree(aggregator.lastRoot, aggregator.items))
        }
        aggregator = {lastRoot: curRoot, items: [pathname]};
      }
    } else {
      node.files.push({pathname: pathname, filename: filename});
    }
    return aggregator;
  }.bind(this), {lastRoot: root, items: []});
  if (root !== aggregator.lastRoot) {
    node.directories.push(this.__createTree(aggregator.lastRoot, aggregator.items))
  }
  return node;
};

CPHTreeView.prototype.__renderTree = function (users, fileManager, node, items, depth) {
  depth = parseInt(depth) || 0;
  var isOpen = !!(this.fileManager && this.fileManager.isDirectoryOpen(node.root));
  var optgroup = this.create(
    'div',
    ['directory-group'],
    {
      'data-root': node.root,
      'data-open': isOpen,
      'data-drop': !!(node.root === this._dropPathname)
    }
  );
  var opt = this.create(
    'div',
    [
      'directory',
      'selectable',
      (this.fileManager && this.fileManager.isHighlighted(node.name)) ? 'highlight' : ''
    ],
    {}
  );
  var renderData;
  if (node.name) {
    renderData = this._formatter(node.root.slice(1), node.name, true) || {};
    renderData.name = renderData.name || node.name;
  } else {
    renderData = {name: this._rootName, icon: this._rootIcon, color: this._rootColor};
  }
  opt.innerHTML = '<span class="pre"></span>'.repeat(depth) +
    '<span class="icon open">' + feather.icons['chevron-down'].toSvg() + '</span>' +
    '<span class="icon closed">' + feather.icons['chevron-right'].toSvg() + '</span>' +
    '<span class="icon folder ' + (renderData.color || '') + '">' +
    (
      renderData.icon
        ? feather.icons[renderData.icon]
          ? feather.icons[renderData.icon].toSvg()
          : renderData.icon.match(/^https?:\/\/|^\.|^\//)
            ? ('<img src="' + renderData.icon + '">')
            : renderData.icon
        : feather.icons['folder'].toSvg()
    ) + '</span>' +
    '<span class="name">' + CPHHelpers.safeHTML(renderData.name) + '</span>' +
    '<span class="spacer"></span>' +
    (
      renderData.description
        ? '<span class="description">' + CPHHelpers.safeHTML(renderData.description) + '</span>'
        : ''
    );
  optgroup.appendChild(opt);
  node.directories.forEach(function (node) {
    optgroup.appendChild(this.__renderTree(users, fileManager, node, items, depth + 1));
  }.bind(this));
  // render actual files...
  node.files
    .filter(function (file) { return !fileManager.isTemporary(file.pathname); })
    .forEach(function (file) {
      optgroup.appendChild(this.__renderFile(users, fileManager, node, items, depth, file));
    }.bind(this));
  // now print temp files...
  var tempFiles = node.files
    .filter(function (file) { return fileManager.isTemporary(file.pathname); });
  if (tempFiles.length) {
    var opt = this.create(
      'div',
      [
        'temporary'
      ],
      {}
    );
    opt.innerHTML = '<span class="pre"></span>'.repeat(depth) +
      '<span class="icon">' + feather.icons['edit-3'].toSvg() + '</span>' +
      '<span class="name">Unsaved files</span>';
    optgroup.appendChild(opt);
    tempFiles
      .sort(function (fileA, fileB) {
        var metaA = fileManager.files[fileA.pathname].tempPathname;
        var metaB = fileManager.files[fileB.pathname].tempPathname;
        return metaA === metaB
          ? fileA.pathname > fileB.pathname
            ? 1
            : -1
          : metaA > metaB
            ? 1
            : -1
      })
      .forEach(function (file) {
        optgroup.appendChild(this.__renderFile(users, fileManager, node, items, depth, file));
      }.bind(this));
  }
  return optgroup;
};

CPHTreeView.prototype.__renderFile = function (users, fileManager, node, items, depth, file) {
  items.push(file.pathname);
  var metadata = fileManager.files[file.pathname] ||
    {
      type: file.type,
      modified: false,
      readonly: false,
      users: {},
      tempPathname: null
    };
  var attributes = {'data-index': items.length - 1};
  if (fileManager.isLoading(file.pathname)) {
    attributes['data-loading'] = true;
  }
  var contentType = metadata.type.split('/');
  var contentIcon = 'file';
  switch (contentType[0]) {
    case 'text':
    case 'application':
      contentIcon = CPHHelpers.isBinaryType(metadata.type)
        ? 'file'
        : 'file-text';
      break;
    case 'image':
      contentIcon = 'image';
      break;
    case 'video':
      contentIcon = 'film';
      break;
    case 'audio':
      contentIcon = 'volume-2'
      break;
  }
  if (metadata.readonly) {
    contentIcon = 'lock';
  }
  var opt = this.create(
    'div',
    [
      'file',
      'selectable',
      metadata.modified ? 'modified' : '',
      metadata.readonly ? 'readonly' : '',
      (this.fileManager && this.fileManager.isHighlighted(file.pathname)) ? 'highlight' : ''
    ],
    attributes
  );
  var pathname = metadata.tempPathname || file.pathname;
  var filename = metadata.tempPathname
    ? metadata.tempPathname.split('/').pop()
    : file.filename;
  var renderData = this._formatter(pathname, filename, false) || {};
  renderData.name = renderData.name || filename;
  opt.innerHTML = (metadata.tempPathname ? '' : '<span class="pre"></span>'.repeat(depth + 1)) +
    '<span class="icon"></span>' +
    '<span class="icon loading">' + feather.icons['loader'].toSvg() + '</span>' +
    '<span class="icon not-loading ' + (renderData.color || '') + '">' + (
      renderData.icon
        ? feather.icons[renderData.icon]
          ? feather.icons[renderData.icon].toSvg()
          : renderData.icon.match(/^https?:\/\/|^\.|^\//)
            ? ('<img src="' + renderData.icon + '">')
            : renderData.icon
        : feather.icons[contentIcon].toSvg()
    ) + '</span>' +
    '<span class="name">' +
      (
        metadata.tempPathname
          ? '<em>' + CPHHelpers.safeHTML(renderData.name) + '*</em>'
          : CPHHelpers.safeHTML(renderData.name)
      ) +
    '</span>' +
    '<span class="spacer"></span>' +
    (
      renderData.description
        ? '<span class="description">' + CPHHelpers.safeHTML(renderData.description) + '</span>'
        : ''
    ) +
    users.map(function (user, i) {
      var zi = users.length - i;
      if (metadata.users[user.uuid]) {
        return [
          '<span class="user' +
            (user.uuid === this.editor.user.uuid ? ' self': '') +
            '" style="color: ' + CPHHelpers.safeHTML(user.color) + '; z-index: ' + zi + ';">',
            user.image
              ? '<img src="' + CPHHelpers.safeHTML(user.image) + '">'
              : '',
          '</span>'
        ].join('');
      } else {
        return '';
      }
    }.bind(this)).join('');
  return opt;
};

/**
* Sets root into for treeView
* @param {string} name the name of root (default: "(root)")
* @param {string} icon the image icon for root (default: "")
* @param {string} color the color of the icon, can be ["green", "red", "blue", "orange"]
*/
CPHTreeView.prototype.setRootInfo = function (name, icon, color) {
  this._rootName = name === undefined ? this._rootName : name;
  this._rootIcon = icon === undefined ? this._rootIcon : icon;
  this._rootColor = color === undefined ? this._rootColor : color;
  this.redraw();
};

/**
* Sets formatter
* @param {function} formatFn A function of format (pathname, filename, isDirectory) => object {name, icon, color}
*/
CPHTreeView.prototype.setFormatter = function (formatFn) {
  if (typeof formatFn !== 'function') {
    throw new Error('.setFormatter requires function');
  }
  this._formatter = formatFn;
};
