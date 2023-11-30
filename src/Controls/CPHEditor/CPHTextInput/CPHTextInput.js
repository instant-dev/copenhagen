function CPHTextInput (app, cfg) {

  this.app = app;

  this.icon = cfg.icon || 'chevron-right';
  this.description = cfg.description || 'Enter a value';
  this.placeholder = cfg.placeholder || 'e.g. some value';
  this.confirmText = cfg.confirmText || 'OK';
  this.value = cfg.value || '';
  this.selection = Array.isArray(cfg.selection)
    ? cfg.selection
    : [0, this.value.length];
  this.validation = typeof cfg.validation === 'function'
    ? cfg.validation
    : function (value) { return value ? true : 'Must not be empty'; };

  Control.call(this);

  this.input = this.selector('input[type="text"][name="input-text"]');
  this.submitButton = this.selector('button[name="submit"]');

  this.input.selectionStart = this.selection[0];
  this.input.selectionEnd = this.selection[1];

  this.validate(this.value);

};

CPHTextInput.prototype = Object.create(Control.prototype);
CPHTextInput.prototype.constructor = CPHTextInput;
CPHTextInput.prototype.controlName = 'CPHTextInput';
window.Controls['CPHTextInput'] = CPHTextInput;

CPHTextInput.prototype.eventListeners = {
  '&': {
    mousedown: function capture (e, el) {
      if (e.target === el) {
        this.close();
      }
    },
    touchstart: function capture (e, el) {
      if (e.target === el) {
        this.close();
      }
    },
    keydown: function (e) {
      if (e.key.toLowerCase() === 'escape') {
        this.close();
      }
    }
  },
  'input[type="text"][name="input-text"]': {
    input: function (e) {
      var value = this.value = this.input.value;
      this.validate(value);
    },
    keydown: function (e) {
      if (this.input.value && e.key.toLowerCase() === 'enter') {
        this.submit(this.input.value);
      }
    },
    blur: function (e, el) {
      var relatedEl = e.relatedTarget;
      var thisEl = this.element();
      while (relatedEl && relatedEl !== thisEl) {
        relatedEl = relatedEl.parentNode;
      }
      if (relatedEl !== thisEl) {
        el.focus();
      }
    }
  },
  'button[name="submit"]': {
    click: function (e, el) {
      this.submit(this.input.value);
    }
  }
};

CPHTextInput.prototype.validate = function (value) {
  var result = this.validation(value);
  if (result === true) {
    this.submitButton.removeAttribute('disabled');
    this.selector('.error').removeAttribute('data-error');
    this.selector('.error').innerText = '';
    this.dispatch('change', this, value);
  } else {
    this.submitButton.setAttribute('disabled', '');
    if (result && typeof result === 'string') {
      this.selector('.error').setAttribute('data-error', '');
      this.selector('.error').innerText = result;
    } else {
      this.selector('.error').removeAttribute('data-error');
      this.selector('.error').innerText = '';
    }
  }
};

CPHTextInput.prototype.submit = function (value) {
  if (!this.submitButton.hasAttribute('disabled')) {
    this.dispatch('submit', this, value);
    this.close();
  }
};

CPHTextInput.prototype.open = function () {
  Control.prototype.open.apply(this, arguments);
  setTimeout(function () {
    this.input.focus();
  }.bind(this), 1);
};
