function CPHConfirm (app, cfg) {

  this.app = app;

  this.icon = cfg.icon || 'info';
  this.message = cfg.message || 'Are you sure?';
  Control.call(this);

  this.cancel = this.selector('button[name="cancel"]');
  this.submit = this.selector('button[name="submit"]');

};

CPHConfirm.prototype = Object.create(Control.prototype);
CPHConfirm.prototype.constructor = CPHConfirm;
CPHConfirm.prototype.controlName = 'CPHConfirm';
window.Controls['CPHConfirm'] = CPHConfirm;

CPHConfirm.windows = [];

CPHConfirm.prototype.eventListeners = {
  '&': {
    mousedown: function capture (e, el) {
      if (e.target === el) {
        this.selector('.modal').classList.add('animate-no');
        clearTimeout(this._animateNoTimeout);
        this._animateNoTimeout = setTimeout(function () {
          this.selector('.modal').classList.remove('animate-no');
        }.bind(this), 200);
      }
    },
    touchstart: function capture (e, el) {
      if (e.target === el) {
        this.selector('.modal').classList.add('animate-no');
        clearTimeout(this._animateNoTimeout);
        this._animateNoTimeout = setTimeout(function () {
          this.selector('.modal').classList.remove('animate-no');
        }.bind(this), 200);
      }
    },
    keydown: function (e) {
      if (e.key.toLowerCase() === 'escape') {
        this.dispatch('cancel', this);
        this.close();
      }
    }
  },
  'button[name="cancel"]': {
    blur: function (e, el) {
      if (
        this.isTopWindow() &&
        e.relatedTarget !== this.submit &&
        e.relatedTarget !== this.cancel
      ) {
        e.preventDefault();
        e.stopPropagation();
        this.cancel.focus();
      }
    },
    click: function (e, el) {
      this.dispatch('cancel', this);
      this.close();
    }
  },
  'button[name="submit"]': {
    blur: function (e, el) {
      if (
        this.isTopWindow() &&
        e.relatedTarget !== this.submit &&
        e.relatedTarget !== this.cancel
      ) {
        e.preventDefault();
        e.stopPropagation();
        this.submit.focus();
      }
    },
    click: function (e, el) {
      this.dispatch('ok', this);
      this.close();
    }
  }
};

CPHConfirm.prototype.topWindow = function () {
  return CPHConfirm.windows[CPHConfirm.windows.length - 1] || null;
};

CPHConfirm.prototype.isTopWindow = function () {
  return this.topWindow() === this;
};

CPHConfirm.prototype.close = function () {
  CPHConfirm.windows.splice(CPHConfirm.windows.indexOf(this), 1);
  this.topWindow() && this.topWindow().submit.focus();
  Control.prototype.close.apply(this, arguments);
};

CPHConfirm.prototype.open = function () {
  Control.prototype.open.apply(this, arguments);
  CPHConfirm.windows.push(this);
  setTimeout(function () {
    this.submit.focus();
  }.bind(this), 1);
};
