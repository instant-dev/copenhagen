const fs = require('fs');
const uuid = require('uuid');

const CPHCursor_text = fs.readFileSync(__dirname + '/../../src/Controls/CPHEditor/CPHCursor/CPHCursor.js').toString();

const ImportedCPHCursor = new Function(`${CPHCursor_text}; return CPHCursor;`)();


const REMOVE_CARRIAGE_RETURNS = {
  'Initialize': true,
  'InsertText': true
};

const MAX_OPTIMIZED_OPERATIONS_COUNT = 1000; // store N entries when optimizing
const MAX_OPERATIONS_COUNT = 2000;
const OPERATIONS_CACHE_GAP = 20; // cache value every X entries

module.exports = class TextOperations {

  constructor (text) {
    this.hasUser = {};
    this.add = [];
    this.addRevision = -1;
    this.addOperationLookup = {};
    this.remove = [];
    this.removeRevision = -1;
    this.removeOperationRegistered = {};
    this.cacheGap = OPERATIONS_CACHE_GAP;
    this.initialize((text || '') + '');
  }

  getInitialValue () {
    return this.add[0].args[0][0];
  }

  serialize (clientRevision) {
    clientRevision = Array.isArray(clientRevision)
      ? [
          isNaN(clientRevision[0]) ? -1 : Math.max(-1, parseInt(clientRevision[0])),
          isNaN(clientRevision[1]) ? -1 : Math.max(-1, parseInt(clientRevision[1]))
        ]
      : [-1, -1];
    return {
      clientRevision: clientRevision,
      serverRevision: this.currentRevision(),
      operations: this.listRevisions(clientRevision[0], clientRevision[1])
    };
  }

  toString () {
    return JSON.stringify(this.serialize(), null, 2);
  }

  sanitize (addOperation) {
    let historyArgs = addOperation.args;
    let args = historyArgs[0];
    if (REMOVE_CARRIAGE_RETURNS[addOperation.name]) {
      if (Array.isArray(args[0])) {
        args[0] = args[0].map(arg => {
          if (typeof arg === 'string') {
            return arg.replace(/[\r]/gi, '');
          } else {
            return arg;
          }
        });
      } else if (typeof args[0] === 'string') {
        args[0] = args[0].replace(/[\r]/gi, '');
      }
    }
    return addOperation;
  }

  export () {
    return this.serialize().operations;
  }

  import (operations) {
    this.hasUser = {};
    this.add = [];
    this.addRevision = -1;
    this.addOperationLookup = {};
    this.remove = [];
    this.removeRevision = -1;
    this.removeOperationRegistered = {};
    operations.add.forEach(addOperation => {
      addOperation = this.sanitize(addOperation);
      this.add.push(addOperation);
      this.addRevision = addOperation.rev;
      this.addOperationLookup[addOperation.uuid] = addOperation;
      this.hasUser[addOperation.user_uuid] = true;
    });
    operations.remove.forEach(removeOperation => {
      this.remove.push(removeOperation);
      this.removeRevision = removeOperation.rev;
      this.removeOperationRegistered[removeOperation.uuid] = true;
    });
    this.optimize();
  }

  initialize (text) {
    return this.createAddOperation('', uuid.v4(), '', 'Initialize', [[text], null]);
  }

  overwrite (newText) {
    this.createAddOperation('', uuid.v4(), '', 'SelectAll', [[], null]);
    this.createAddOperation('', uuid.v4(), '', 'InsertText', [[newText], null]);
    return true;
  }

  currentRevision () {
    return [this.addRevision, this.removeRevision];
  }

  receiveClientTextOperations (client, textOperations, textReconstructor) {
    let startRevision = this.currentRevision();
    textOperations.operations.add
      .filter(op => op.rev === -1 && !this.addOperationLookup[op.uuid])
      .forEach(op => this.createAddOperation(client.uuid, op.uuid, op.user_uuid, op.name, op.args));
    textOperations.operations.remove
      .filter(op => op.rev === -1 && !this.removeOperationRegistered[op.uuid])
      .forEach(op => this.createRemoveOperation(client.uuid, op.uuid, textReconstructor));
    let currentRevision = this.currentRevision();
    let optimized = false;
    if (this.add.length > MAX_OPERATIONS_COUNT || this.remove.length > MAX_OPERATIONS_COUNT) {
      this.optimize();
      optimized = true;
    }
    return {
      addCount: currentRevision[0] - startRevision[0],
      removeCount: currentRevision[1] - startRevision[1],
      textOperations: this.serialize(textOperations.clientRevision),
      optimized: optimized
    };
  }

  createAddOperation (clientUUID, uuid, userUUID, name, args) {
    if (clientUUID !== userUUID) {
      throw new Error(`Client "${clientUUID}" can not create operation belonging to "${userUUID}"`);
    }
    if (this.addOperationLookup[uuid]) {
      throw new Error(`Client "${clientUUID}" operation collision, rejecting operations`);
    }
    let addOperation = this.sanitize({
      rev: ++this.addRevision,
      uuid: uuid,
      user_uuid: userUUID,
      name: name,
      args: args
    });
    this.add.push(addOperation);
    this.addOperationLookup[addOperation.uuid] = addOperation;
    this.hasUser[addOperation.user_uuid] = true;
    return addOperation;
  };

  createRemoveOperation (clientUUID, uuid, textReconstructor) {
    let removeOperation = {
      rev: ++this.removeRevision,
      uuid: uuid
    };
    let addOperation = this.addOperationLookup[removeOperation.uuid];
    if (addOperation) {
      if (clientUUID !== addOperation.user_uuid) {
        throw new Error(`Client "${clientUUID}" can not remove operation belonging to "${addOperation.user_uuid}"`);
      }
      // IMPORTANT:
      // Checking line counts has been added to ensure we update future
      // "Select" actions eg text selection activities.
      // Changing the undo stack modifies the position of lines, code, etc.
      // Also in CPHHistory.js
      textReconstructor.reconstructTextOperations(this, addOperation.rev, true);
      let value = addOperation.value;
      let cursorMap = addOperation.cursorMap || {};
      let cursors = (cursorMap[addOperation.user_uuid] || []).map(function (c) {
        return new ImportedCPHCursor(c.start, c.end).getSelectionInformation(value);
      });
      let removeLineCounts = null;
      if (addOperation.name === 'InsertText' || addOperation.name === 'RemoveText') {
        let insertedLineCounts = [1];
        if (addOperation.name === 'InsertText') {
          let args = addOperation.args[0];
          if (!Array.isArray(args[0])) {
            args[0] = [args[0]];
          }
          insertedLineCounts = args[0].map(function (text) {
            return text.split('\n').length;
          });
        }
        let nonzero = false;
        removeLineCounts = cursors.map(function (cursor, i) {
          let delta = insertedLineCounts[i % insertedLineCounts.length] - cursor.lines.length;
          if (delta !== 0) {
            nonzero = true;
          }
          return delta;
        });
        removeLineCounts = nonzero
          ? removeLineCounts
          : null;
      }
      addOperation.name = 'NoOp';
      addOperation.args = [[], null];
      this.remove.push(removeOperation);
      this.removeOperationRegistered[removeOperation.uuid] = true;
      // Remove the cached values and cursorMaps
      //   from everything after the deleted point
      this.add.slice(addOperation.rev).forEach(textOperation => {
        delete textOperation.cursorMap;
        delete textOperation.value;
        if (textOperation.name === 'Select' && removeLineCounts) {
          var startPosition = null
          var endPosition = null;
          var startSelectPosition = textOperation.args[0][2] || {};
          var endSelectPosition = textOperation.args[0][3] || {};
          if (
            startSelectPosition.lineNumber > endSelectPosition.lineNumber ||
            (
              startSelectPosition.lineNumber === endSelectPosition.lineNumber &&
              startSelectPosition.column > endSelectPosition.column
            )
          ) {
            startPosition = endSelectPosition;
            endPosition = startSelectPosition;
          } else {
            startPosition = startSelectPosition;
            endPosition = endSelectPosition;
          }
          cursors.forEach(function (cursor, i) {
            if (startPosition.lineNumber > cursor.lineNumber + cursor.lines.length - 1) {
              startPosition.lineNumber -= removeLineCounts[i];
            } else if (startPosition.lineNumber > cursor.lineNumber) {
              startPosition.lineNumber = Math.max(
                startPosition.lineNumber,
                startPosition.lineNumber - removeLineCounts[i]
              )
            }
            if (endPosition.lineNumber > cursor.lineNumber + cursor.lines.length - 1) {
              endPosition.lineNumber -= removeLineCounts[i];
            } else if (endPosition.lineNumber > cursor.lineNumber) {
              endPosition.lineNumber = Math.max(
                endPosition.lineNumber,
                endPosition.lineNumber - removeLineCounts[i]
              )
            }
          });
        }
      });
      return removeOperation;
    }
  }

  updateOperationWithValue (uuid, users, value, force = false) {
    let entry = this.addOperationLookup[uuid];
    if (!entry) {
      throw new Error(`Could not update cache entry for textOperation "${uuid}"`);
    }
    if (force || entry.rev % this.cacheGap === 0) {
      let cursorMap = users.reduce((cursorMap, user) => {
        cursorMap[user.uuid] = user.cursors.map(cursor => cursor.toObject());
        return cursorMap;
      }, {});
      entry.cursorMap = cursorMap;
      entry.value = value;
    }
    return entry;
  }

  listRevisions (clientAddRevision, clientRemoveRevision) {
    return {
      add: this.add.slice(clientAddRevision + 1),
      remove: this.remove.slice(clientRemoveRevision + 1)
    };
  }

  optimize () {
    let addOperations = this.add.slice();
    this.add = [];
    this.addRevision = -1;
    this.addOperationLookup = {};
    this.remove = [];
    this.removeRevision = -1;
    this.removeOperationRegistered = {};
    // We have a heuristic we can implement here for Selections
    // Basically when a ResetCursor is followed by Select / CollapseCursors
    // exclusively, it means the user is just selecting text. This always ends
    // with a combo of Select / Collapse / Reset.
    // So we can combined any set of [ResetCursor, ..., Select, {ResetCursor, CollapseCursors} x n]
    // and remove the [...]
    // This saves us a ton of space
    let optimizer = addOperations.reduce((optimizer, op) => {
      if (op.name !== 'NoOp') {
        if (
          optimizer.selectQueue.length &&
          (
            (optimizer.lastOp && (optimizer.lastOp.user_uuid !== op.user_uuid)) ||
            ['ResetCursor', 'CollapseCursors', 'Select'].indexOf(op.name) === -1
          )
        ) {
          let revSelectIndex = optimizer.selectQueue.slice().reverse()
            .findIndex(op => op.name === 'Select');
          let lastSelectIndex = optimizer.selectQueue.length - revSelectIndex - 1;
          if (lastSelectIndex >= optimizer.selectQueue.length) {
            lastSelectIndex = -1;
          }
          if (lastSelectIndex > 0) {
            optimizer.operations = [].concat(
              optimizer.operations,
              optimizer.selectQueue[0],
              optimizer.selectQueue.slice(lastSelectIndex)
            )
          } else {
            optimizer.operations = [].concat(
              optimizer.operations,
              optimizer.selectQueue
            )
          }
          optimizer.selectQueue = [];
        }
        // start a new queue on ResetCursor
        if (optimizer.selectQueue.length || op.name === 'ResetCursor') {
          optimizer.selectQueue.push(op);
        } else {
          optimizer.operations.push(op);
        }
        optimizer.lastOp = op;
      }
      return optimizer;
    }, {operations: [], selectQueue: [], lastOp: null});
    [].concat(
      optimizer.operations,
      optimizer.selectQueue
    ).forEach(op => {
      op.rev = ++this.addRevision;
      this.add.push(op);
      this.addRevision = op.rev;
      this.addOperationLookup[op.uuid] = op;
    });
    if (this.add.length > MAX_OPTIMIZED_OPERATIONS_COUNT) {
      for (let i = this.add.length - MAX_OPTIMIZED_OPERATIONS_COUNT; i >= 0; i--) {
        let op = this.add[i];
        if (('cursorMap' in op) && ('value' in op)) {
          let ops = this.add.slice(i);
          let value = op.value;
          this.add = [];
          this.addRevision = -1;
          this.addOperationLookup = {};
          this.initialize(value);
          ops.forEach((op, i) => {
            if (i > 0) {
              delete op.cursorMap;
              delete op.value;
            }
            op.rev = ++this.addRevision;
            this.add.push(op);
            this.addRevision = op.rev;
            this.addOperationLookup[op.uuid] = op;
          });
          break;
        }
      }
    }
  }

};
