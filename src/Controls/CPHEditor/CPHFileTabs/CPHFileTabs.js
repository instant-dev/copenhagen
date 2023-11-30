function CPHFileTabs (app, cfg) {

  this.app = app;
  this.items = [];
  this.selectedIndex = -1;

  this.newFileOptions = [];

  this._drag = null;
  this._dragDistance = 5; // drag distance in pixels...
  this._dropIndex = null;

  this._contextMenu = null;

  this.editor = cfg.editor;

  if (!(this.editor instanceof CPHEditor)) {
    throw new Error('Must provide "editor" as CPHEditor');
  }

  Control.call(this);

  this.populate();

};

CPHFileTabs.prototype = Object.create(Control.prototype);
CPHFileTabs.prototype.constructor = CPHFileTabs;
CPHFileTabs.prototype.controlName = 'CPHFileTabs';
window.Controls['CPHFileTabs'] = CPHFileTabs;

CPHFileTabs.prototype.eventListeners = {
  '.new-file': {
    mouseenter: function (e, el) {
      var items = [
        {
          icon: 'file-text',
          title: 'CSS',
          action: function (data) {
            this.dispatch('file.create', this, '*:untitled.css');
          }.bind(this)
        },
        {
          icon: 'file-text',
          title: 'HTML',
          action: function (data) {
            this.dispatch('file.create', this, '*:untitled.html');
          }.bind(this)
        },
        {
          icon: 'code',
          title: 'JavaScript',
          action: function (data) {
            this.dispatch('file.create', this, '*:untitled.js');
          }.bind(this)
        },
        {
          icon: 'file-text',
          title: 'JSON',
          action: function (data) {
            this.dispatch('file.create', this, '*:untitled.json');
          }.bind(this)
        },
        {
          icon: 'book-open',
          title: 'Markdown',
          action: function (data) {
            this.dispatch('file.create', this, '*:untitled.md');
          }.bind(this)
        },
        {
          icon: 'file',
          title: 'Text',
          action: function (data) {
            this.dispatch('file.create', this, '*:untitled.txt');
          }.bind(this)
        }
      ];
      this.newFileOptions.length && items.unshift('-');
      this.newFileOptions.slice().reverse().forEach(function (newFileOption) {
        items.unshift({
          icon: newFileOption.icon,
          title: newFileOption.title,
          action: function (data) {
            this.dispatch('file.create', this, '*:' + newFileOption.pathname, newFileOption.value);
          }.bind(this)
        });
      }.bind(this));
      this._contextMenu = new CPHContextMenu(
        this.app,
        {
          parent: this,
          data: {},
          items: items
        }
      );
      this._contextMenu.open(el);
      this._contextMenu.on('close', function () {
        this._contextMenu = null;
      }.bind(this));
    }
  },
  'div.files': {
    click: function (e, el) {
      var tabData = this._getTabIndexFromElement(e.target);
      if (tabData) {
        if (tabData.close) {
          this.dispatch('close', this, this.items[tabData.index]);
        } else if (tabData.index !== this.selectedIndex) {
          this.selectedIndex = tabData.index;
          var item = this.items[this.selectedIndex];
          this.dispatch('select', this, item);
        }
      }
    },
    mousedown: function capture (e, el) {
      if (e.which === 1) {
        var tabData = this._getTabIndexFromElement(e.target);
        if (tabData) {
          var rect = tabData.element.getBoundingClientRect();
          this._drag = {
            index: tabData.index,
            x: e.clientX,
            y: e.clientY,
            dx: e.clientX - rect.left,
            dy: e.clientY - rect.top,
            valid: true,
            element: null
          };
        }
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

CPHFileTabs.prototype.windowEvents = {
  mousemove: function (e) {
    if (this._drag) {
      if (!this._drag.element) {
        var dx = e.clientX - this._drag.x;
        var dy = e.clientY - this._drag.y;
        var d = Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2));
        if (d > this._dragDistance) {
          this._drag.element = this.selector('[data-index="' + this._drag.index + '"]').cloneNode(true);
          this._drag.element.classList.add('file-tabs-dragging');
          this._drag.element.style.position = 'fixed';
          this._drag.element.style.zIndex = 999;
          this._drag.element.style.opacity = 0.8;
          document.body.appendChild(this._drag.element);
          document.documentElement.style.setProperty('cursor', 'grabbing');
          document.body.style.setProperty('pointer-events', 'none');
        }
      }
      this.selectorAll('.separator.highlighted').forEach(function (el) {
        el.classList.remove('highlighted');
      });
      if (this._drag.element) {
        this._drag.element.style.left = (e.clientX - this._drag.dx) + 'px';
        this._drag.element.style.top = (e.clientY - this._drag.dy) + 'px';
        this._drag.element.style.display = 'none';
        document.body.style.setProperty('pointer-events', '');
        var targetEl = document.elementFromPoint(e.clientX, e.clientY);
        document.body.style.setProperty('pointer-events', 'none');
        this._drag.element.style.display = '';
        var tabData = this._getTabIndexFromElement(targetEl);
        if (tabData) {
          var rect = tabData.element.getBoundingClientRect();
          var elRect = this._drag.element.getBoundingClientRect();
          var offCenter = rect.x - elRect.x + ((rect.width - elRect.width) / 2);
          var posIndex = Math.round(tabData.index + 0.5 - (offCenter / rect.width));
          this.selector('[data-sep-index="' + posIndex + '"]').classList.add('highlighted');
          this._dropIndex = posIndex;
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
        this.selectorAll('.separator.highlighted').forEach(function (el) {
          el.classList.remove('highlighted');
        });
        if (this._dropIndex !== null) {
          this.dispatch('swap', this, this._drag.index, this._dropIndex);
          this._dropIndex = null;
        }
      }
      this._drag = null;
    }
  },
  blur: function (e) {
    if (this._drag) {
      this._dropIndex = null;
      this._drag = null;
    }
  }
};

CPHFileTabs.prototype._getTabIndexFromElement = function (targetEl) {
  var baseEl = this.selector('div.files');
  var shouldClose = targetEl && targetEl.classList && targetEl.classList.contains('close');
  while (targetEl && targetEl.classList && !targetEl.classList.contains('selectable') && targetEl !== baseEl) {
    targetEl = targetEl.parentNode;
  }
  var checkEl = targetEl;
  while (checkEl && checkEl !== baseEl) {
    checkEl = checkEl.parentNode;
  }
  if (!checkEl) {
    return null;
  } else if (targetEl === baseEl) {
    return null;
  } else if (targetEl.classList && targetEl.classList.contains('file') && targetEl.hasAttribute('data-index')) {
    var selectedIndex = (targetEl.getAttribute('data-index') | 0);
    return {index: selectedIndex, close: shouldClose, element: targetEl};
  } else {
    return null;
  }
};

CPHFileTabs.prototype.addNewFileOption = function (newFileOption) {
  newFileOption = newFileOption || {};
  var opt = {
    icon: typeof newFileOption.icon === 'function'
      ? newFileOption.icon()
      : newFileOption.icon,
    title: newFileOption.title || 'New File',
    value: newFileOption.value || '',
    pathname: newFileOption.pathname || 'untitled'
  };
  this.newFileOptions.push(opt);
};

CPHFileTabs.prototype.populate = function (users, fileManager) {

  users = users || [];

  var items = [];
  var pathname = '';

  if (fileManager) {
    items = fileManager.openFilesList.map(function (file) { return file.pathname; });
    pathname = fileManager.activeFile && fileManager.activeFile.pathname;
  }

  items = Array.isArray(items) ? items : [];
  this.items = items.slice();
  this.__render(users, fileManager, this.items);
  var selectedIndex = this.items.indexOf(pathname);
  this.selectedIndex = selectedIndex > -1 ? selectedIndex : this.selectedIndex;
  var fileTabsEl = this.selector('div.files');
  var el = fileTabsEl.querySelector('[data-index="' + this.selectedIndex + '"]');
  el && el.setAttribute('data-selected', '');

};

CPHFileTabs.prototype.__render = function (users, fileManager, items) {
  var fileTabsEl = this.selector('div.files');
  var newFileEl = this.selector('div.files .new-file');
  fileTabsEl.innerHTML = '';
  items.forEach(function (item, i) {
    var separatorEl = this.create('div', ['separator'], {'data-sep-index': i});
    fileTabsEl.appendChild(separatorEl);
    var metadata = fileManager.files[item];
    var pathname = item;
    var filename = item.split('/').pop();
    var attributes = {'data-index': i};
    if (fileManager.isLoading(pathname)) {
      attributes['data-loading'] = true;
    }
    var fileEl = this.create(
      'div',
      [
        'file',
        'selectable',
        metadata.modified ? 'modified' : ''
      ],
      attributes
    );
    fileEl.innerHTML =
      '<span class="name">' +
        (
          metadata.tempPathname
            ? '<em>' + CPHHelpers.safeHTML(metadata.tempPathname.split('/').pop()) + '*</em>'
            : CPHHelpers.safeHTML(filename)
        ) +
      '</span>' +
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
      }.bind(this)).join('') +
      '<span class="close"></span>' +
      '<span class="loading">' + feather.icons['loader'].toSvg() + '</span>';
    fileTabsEl.appendChild(fileEl);
  }.bind(this));
  if (items.length) {
    var separatorEl = this.create('div', ['separator'], {'data-sep-index': items.length});
    fileTabsEl.appendChild(separatorEl);
  }
  fileTabsEl.appendChild(newFileEl);
  return true;
};
