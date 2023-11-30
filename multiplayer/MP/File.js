const fs = require('fs');
const path = require('path');

const TextOperations = require('./TextOperations.js');
const types = require('./helpers/types.js');

module.exports = class MPFile {

  constructor (
    pathname, buffer, tempPathname = null, readonly = false,
    initialBuffer = null, operations = null
  ) {
    if (!pathname) {
      throw new Error('Cannot create file without pathname');
    }
    buffer = buffer || Buffer.from('');
    this.clientRevisions = {};
    this.clientActivity = {};
    this.pathname = pathname + '';
    this.tempPathname = typeof tempPathname === 'string'
      ? (tempPathname || null)
      : null;
    this.type = this.tempPathname
      ? (types.getType(this.tempPathname) || 'text/plain')
      : (types.getType(this.pathname) || 'text/plain');
    this.readonly = !!readonly;
    if (!types.isBinaryType(this.type)) {
      buffer = Buffer.from(buffer.toString('utf8').replace(/[\r]/gi, ''));
      if (initialBuffer) {
        initialBuffer = Buffer.from(initialBuffer.toString('utf8').replace(/[\r]/gi, ''));
      }
      if (this.tempPathname) {
        this.write(Buffer.from(''), this.readonly);
        this.commit();
        this.textOperations = new TextOperations(this.value);
        this.textOperations.initialize(buffer.toString('utf8'));
        this.write(buffer, this.readonly);
      } else {
        this.write(buffer, this.readonly);
        this.commit();
        this.textOperations = new TextOperations(this.value);
      }
    } else {
      this.write(buffer, this.readonly);
      this.commit();
      this.textOperations = null;
    }
    // loading from cache...
    if (initialBuffer) {
      this.initialBuffer = initialBuffer;
      this.initialValue = initialBuffer.toString('utf8');
    }
    if (this.textOperations && operations) {
      this.textOperations.import(operations);
    }
  }

  isReadOnly () {
    return !!this.readonly;
  }

  isModified () {
    return !!this.tempPathname || (this.value !== this.initialValue);
  }

  isTemporary () {
    return this.tempPathname !== null;
  }

  hasWorkingClients () {
    return Object.keys(this.clientRevisions).length > 0;
  }

  hasClientRevision (uuid) {
    return !!this.clientRevisions[uuid];
  }

  setClientRevision (uuid, clientRevision) {
    clientRevision = Array.isArray(clientRevision)
      ? [
          isNaN(clientRevision[0]) ? -1 : Math.max(-1, parseInt(clientRevision[0])),
          isNaN(clientRevision[1]) ? -1 : Math.max(-1, parseInt(clientRevision[1]))
        ]
      : [-1, -1];
    return (this.clientRevisions[uuid] = clientRevision.slice()).slice();
  }

  getClientRevision (uuid) {
    if (!this.hasClientRevision(uuid)) {
      throw new Error(`Can not get clientRevision for "${this.pathname}": user has not opened file`);
    }
    return this.clientRevisions[uuid].slice();
  }

  clearClientRevision (uuid) {
    this.getClientRevision(uuid);
    delete this.clientRevisions[uuid];
    if (!Object.keys(this.clientRevisions).length && this.textOperations) {
      this.textOperations.optimize();
    }
  }

  setActive (uuid) {
    this.clientActivity[uuid] = true;
  }

  clearActive (uuid) {
    delete this.clientActivity[uuid];
  }

  // does *not* update textOperations, assumes already complete
  write (buffer, force = false) {
    if (!force && this.readonly) {
      throw new Error(`Can not write to readonly file "${this.pathname}"`);
    }
    if (!Buffer.isBuffer(buffer)) {
      buffer = Buffer.from(buffer + '', 'utf8');
    }
    if (!types.isBinaryType(this.type)) {
      buffer = Buffer.from(buffer.toString('utf8').replace(/[\r]/gi, ''));
    }
    this.buffer = buffer;
    this.value = buffer.toString('utf8');
    return this;
  }

  // updates textOperations, for full overwrite
  overwrite (buffer) {
    this.write(buffer, true);
    if (this.textOperations) {
      this.textOperations.initialize(this.value);
    }
    return this;
  }

  rename (pathname) {
    this.pathname = pathname;
    this.tempPathname = null;
    this.type = types.getType(this.pathname) || 'text/plain';
    if (types.isBinaryType(this.type)) {
      this.textOperations = null;
    } else {
      // Remove carriage returns
      this.initialBuffer = Buffer.from(this.initialBuffer.toString('utf8').replace(/[\r]/gi, ''));
      this.initialValue = this.initialBuffer.toString('utf8');
      this.buffer = Buffer.from(this.buffer.toString('utf8').replace(/[\r]/gi, ''));
      this.value = this.buffer.toString('utf8');
    }
    return this;
  }

  renameTemp (tempPathname) {
    if (this.tempPathname !==  null) {
      this.tempPathname = tempPathname;
      this.type = types.getType(this.tempPathname) || 'text/plain';
      if (types.isBinaryType(this.type)) {
        this.textOperations = null;
      } else {
        // Remove carriage returns
        this.initialBuffer = Buffer.from(this.initialBuffer.toString('utf8').replace(/[\r]/gi, ''));
        this.initialValue = this.initialBuffer.toString('utf8');
        this.buffer = Buffer.from(this.buffer.toString('utf8').replace(/[\r]/gi, ''));
        this.value = this.buffer.toString('utf8');
      }
    }
    return this;
  }

  commit () {
    this.initialBuffer = this.buffer;
    this.initialValue = this.value;
  }

  resetHistory () {
    this.buffer = this.initialBuffer;
    this.value = this.initialValue;
    if (!types.isBinaryType(this.type)) {
      this.textOperations = new TextOperations(this.value);
    } else {
      this.textOperations = null;
    }
  };

  export (format) {
    switch (format) {
      case 'base64':
        return this.initialBuffer.toString('base64');
        break;
      case 'buffer':
        return this.initialBuffer.slice(0);
        break;
      case 'cache':
        return {
          pathname: this.pathname,
          buffer: this.buffer.toString('base64'),
          tempPathname: this.tempPathname,
          readonly: this.readonly,
          initialBuffer: this.initialBuffer.toString('base64'),
          operations: this.textOperations && this.textOperations.export()
        };
      default:
        throw new Error(`Invalid export format: "${format}"`);
        break;
    }
  }

  serialize (clientRevision) {
    return {
      pathname: this.pathname,
      type: this.type,
      value: types.isBinaryType(this.type)
        ? {_base64: this.buffer.toString('base64')}
        : this.value,
      readonly: this.readonly,
      textOperations: this.textOperations
        ? this.textOperations.serialize(clientRevision)
        : null
    };
  }

};
