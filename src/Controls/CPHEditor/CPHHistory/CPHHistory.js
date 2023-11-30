function CPHHistory (initialValue) {
  this.reset(initialValue);
};

// Can only travel forward / backward in history to these events
CPHHistory.prototype.gotoEnabled = {
  'InsertText': true,
  'RemoveText': true,
  'AddIndent': true,
  'RemoveIndent': true,
  'ToggleComment': true
};

CPHHistory.prototype.removeCarriageReturns = {
  'Initialize': true,
  'InsertText': true
};

// Don't store duplicates of this event
CPHHistory.prototype.deduplicate = {
  'Select': true
};

CPHHistory.prototype.reset = function (initialValue) {
  initialValue = ((initialValue || '') + '').replace(/[\r]/gi, '');
  this.initialValue = initialValue;
  this.operations = {add: [], remove: []};
  this.lookup = {add: {}, remove: {}};
  this.pasts = {};
  this.pastBreakpoint = null;
  this.futures = {};
  this.clientRevision = [-1, -1];
  this.serverRevision = [-1, -1];
  this.addEntry(this.createEntry([], null, 'Initialize', [[initialValue], null], initialValue));
  return this.initialValue;
};

// We may need to reassign user uuid, it's generated on client to start with
// So if the server sends us new information, let's reset it
CPHHistory.prototype.reassignUserUUID = function (formerUUID, newUUID) {
  this.operations.add
    .filter(function (op) { return op.user_uuid === formerUUID; })
    .forEach(function (op) { op.user_uuid = newUUID; })
};

// Reconstitue the file from the last entry we have a value for...
CPHHistory.prototype.getLatestEntries = function () {
  var add = this.operations.add.slice();
  var entries = [add.pop()];
  entries = entries[0] ? entries : [];
  while (
    entries[0] &&
    !entries[0].hasOwnProperty('value') &&
    add[add.length - 1]
  ) {
    entries.unshift(add.pop());
  }
  return entries;
};

CPHHistory.prototype.loadServerTextOperations = function (textOperations) {
  this.initialValue = '';
  this.operations = {add: [], remove: []};
  this.lookup = {add: {}, remove: {}};
  this.pasts = {};
  this.futures = {};
  textOperations.operations.add.forEach(function (add) {
    this.operations.add.push(add);
    this.lookup.add[add.uuid] = add;
    this.pasts[add.user_uuid] = this.pasts[add.user_uuid] || [];
    this.pasts[add.user_uuid].push(add);
    this.futures[add.user_uuid] = [];
  }.bind(this));
  textOperations.operations.remove.forEach(function (remove) {
    this.operations.remove.push(remove);
    this.lookup.remove[remove.uuid] = remove;
  }.bind(this));
  this.clientRevision =
    this.serverRevision =
      textOperations.serverRevision.slice();
  // Now find the last entry with a `value` and `cursorMap` field populated to build history...
  for (var i = this.operations.add.length - 1; i > 0; i--) {
    if (
      this.operations.add[i].hasOwnProperty('value') &&
      this.operations.add[i].hasOwnProperty('cursorMap')
    ) {
      break;
    }
  }
  return this.operations.add.slice(i);
};

// Binary search for point where we last received server revisions
CPHHistory.prototype.splitOperations = function (operationsArray) {
  if (!operationsArray.length) {
    return [[], []];
  }
  var n = operationsArray.length / 2;
  var i = n;
  while (Math.round(n) > 0 && Math.round(i) < operationsArray.length) {
    n = n / 2
    if (operationsArray[Math.round(i)].rev !== -1) {
      i += n;
    } else {
      i -= n;
    }
  }
  i = Math.max(0, Math.min(Math.round(i), operationsArray.length - 1));
  return operationsArray[i].rev === -1
    ? [operationsArray.slice(0, i), operationsArray.slice(i)]
    : [operationsArray.slice(0, i + 1), operationsArray.slice(i + 1)]
};

CPHHistory.prototype.readServerTextOperations = function (textOperations) {
  if (
    this.clientRevision[0] === textOperations.clientRevision[0] &&
    this.clientRevision[1] === textOperations.clientRevision[1]
  ) {
    // First, generate a last of "add" operations
    var clientAddOperations = this.splitOperations(this.operations.add);
    var verifiedClientAddOperations = clientAddOperations[0];
    var pendingClientAddOperations = clientAddOperations[1];
    // First, look through server add operations.
    // These become our new source of truth, they may overwrite pendingClientAddOperations
    var serverAddOperationsLookup = textOperations.operations.add.reduce(function (lookup, op) {
      lookup[op.uuid] = true;
      this.replaceEntryFromServer(op); // automatically sets lookup for us
      return lookup;
    }.bind(this), {});
    // Next, our "pending" operations become the server addOperations + pending
    // Remove the pending operations we already may have replace with server-verified operations
    var addOperations = [].concat(
      textOperations.operations.add.map(function (op) { return this.lookup.add[op.uuid]; }.bind(this)), // Note we need to add here to properly take advantage of local caching
      pendingClientAddOperations.filter(function (op) { return !serverAddOperationsLookup[op.uuid]; })
    );
    this.operations.add = [].concat(
      verifiedClientAddOperations,
      addOperations
    );
    // Now, prepare "remove" operations
    // We follow the same steps as the "add" operations but also take care to
    // call `.removeEntry` to clean up old removals
    var clientRemoveOperations = this.splitOperations(this.operations.remove);
    var verifiedClientRemoveOperations = clientRemoveOperations[0];
    var pendingClientRemoveOperations = clientRemoveOperations[1];
    var newRemoveUUIDs = [];
    var serverRemoveOperationsLookup = textOperations.operations.remove.reduce(function (lookup, op) {
      if (!this.lookup.remove[op.uuid]) {
        newRemoveUUIDs.push(op.uuid);
      }
      lookup[op.uuid] = true;
      this.removeEntry(this.lookup.add[op.uuid]);
      return lookup;
    }.bind(this), {});
    this.operations.remove = [].concat(
      verifiedClientRemoveOperations,
      textOperations.operations.remove.map(function (op) {
        return this.lookup.remove[op.uuid];
      }.bind(this)),
      pendingClientRemoveOperations.filter(function (op) { return !serverRemoveOperationsLookup[op.uuid]; })
    );
    this.clientRevision =
      this.serverRevision =
        textOperations.serverRevision;
    // Now find the last entry with a `value` and `cursorMap` field populated to build history...
    for (var i = this.operations.add.length - 1; i > 0; i--) {
      if (
        this.operations.add[i].hasOwnProperty('value') &&
        this.operations.add[i].hasOwnProperty('cursorMap')
      ) {
        break;
      }
    }
    return this.operations.add.slice(i);
  } else {
    return null;
  }
};

// Prepares operations to add to the server...
CPHHistory.prototype.serializeClientTextOperations = function () {
  var pendingClientAddOperations = this.splitOperations(this.operations.add)[1];
  var pendingClientRemoveOperations = this.splitOperations(this.operations.remove)[1];
  return {
    clientRevision: this.clientRevision,
    serverRevision: this.serverRevision,
    operations: {
      add: pendingClientAddOperations.map(function (entry) {
        return {
          rev: entry.rev,
          uuid: entry.uuid,
          user_uuid: entry.user_uuid,
          name: entry.name,
          args: entry.args
        };
      }),
      remove: pendingClientRemoveOperations.map(function (removeEntry) {
        return {
          rev: removeEntry.rev,
          uuid: removeEntry.uuid
        };
      })
    }
  };
};

CPHHistory.prototype.updateEntryCacheValue = function (uuid, users, value) {
  var entry = this.lookup.add[uuid];
  if (!entry) {
    throw new Error('Could not find history entry: ' + uuid);
  }
  entry.cursorMap = users.reduce(function (cursorMap, user) {
    cursorMap[user.uuid] = user.cursors.map(function (cursor) { return cursor.toObject(); });
    return cursorMap;
  }, {}),
  entry.value = value;
  return entry;
};

// Replace entries from server...
CPHHistory.prototype.replaceEntryFromServer = function (newEntry) {
  var entry = this.lookup.add[newEntry.uuid];
  if (entry) {
    entry.rev = newEntry.rev;
    entry.uuid = newEntry.uuid;
    entry.user_uuid = newEntry.user_uuid;
    delete entry.cursorMap;
    entry.name = newEntry.name;
    entry.args = newEntry.args;
    delete entry.value;
  } else {
    this.lookup.add[newEntry.uuid] = newEntry;
  }
};

CPHHistory.prototype.formatArgs = function (name, args) {
  if (this.removeCarriageReturns[name]) {
    if (Array.isArray(args[0])) {
      args[0] = args[0].map(function (arg) {
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
  return args;
};

CPHHistory.prototype.createEntry = function (users, user, name, args, value) {
  args[0] = this.formatArgs(name, args[0]);
  return {
    rev: -1,
    uuid: CPHHelpers._unsafe_uuidv4(),
    user_uuid: user ? user.uuid : '',
    cursorMap: users.reduce(function (cursorMap, user) {
      cursorMap[user.uuid] = user.cursors.map(function (cursor) { return cursor.toObject(); });
      return cursorMap;
    }, {}),
    name: name,
    args: args,
    value: value
  };
};

CPHHistory.prototype.addEntry = function (entry, preserveFutures) {
  var pasts = this.pasts[entry.user_uuid] = this.pasts[entry.user_uuid] || [];
  var futures = this.futures[entry.user_uuid] = this.futures[entry.user_uuid] || [];
  var lastEntry = pasts[pasts.length - 1];
  if (
    lastEntry &&
    lastEntry.rev === -1 &&
    this.deduplicate[entry.name] &&
    entry.name === lastEntry.name &&
    JSON.stringify(entry.args) === JSON.stringify(lastEntry.args)
  ) {
    return;
  }
  if (!preserveFutures && this.gotoEnabled[entry.name]) {
    futures.splice(0, futures.length);
  }
  pasts.push(entry);
  this.operations.add.push(entry);
  this.lookup.add[entry.uuid] = entry;
  return entry.uuid;
};

// Remove an entry from history
CPHHistory.prototype.removeEntry = function (entry) {
  // IMPORTANT:
  // Checking line counts has been added to ensure we update future
  // "Select" actions eg text selection activities.
  // Changing the undo stack modifies the position of lines, code, etc.
  // Also in TextOperations.js
  var value = entry.value;
  var cursorMap = entry.cursorMap || {};
  var cursors = (cursorMap[entry.user_uuid] || []).map(function (c) {
    return new CPHCursor(c.start, c.end).getSelectionInformation(value);
  });
  var removeLineCounts = null;
  if (entry.name === 'InsertText' || entry.name === 'RemoveText') {
    var insertedLineCounts = [1];
    if (entry.name === 'InsertText') {
      var args = entry.args[0];
      if (!Array.isArray(args[0])) {
        args[0] = [args[0]];
      }
      insertedLineCounts = args[0].map(function (text) {
        return text.split('\n').length;
      });
    }
    var nonzero = false;
    removeLineCounts = cursors.map(function (cursor, i) {
      var delta = insertedLineCounts[i % insertedLineCounts.length] - cursor.lines.length;
      if (delta !== 0) {
        nonzero = true;
      }
      return delta;
    });
    removeLineCounts = nonzero
      ? removeLineCounts
      : null;
  }
  entry.name = 'NoOp';
  entry.args = [[], null];
  delete entry.cursorMap;
  delete entry.value;
  if (!this.lookup.remove[entry.uuid]) {
    this.lookup.remove[entry.uuid] = {rev: -1, uuid: entry.uuid};
    this.operations.remove.push(this.lookup.remove[entry.uuid]);
    var foundIndex = this.operations.add.lastIndexOf(entry);
    if (foundIndex > -1) {
      this.operations.add.slice(foundIndex).forEach(function (entry) {
        delete entry.cursorMap;
        delete entry.value;
        if (entry.name === 'Select' && removeLineCounts) {
          var startPosition = null
          var endPosition = null;
          var startSelectPosition = entry.args[0][2] || {};
          var endSelectPosition = entry.args[0][3] || {};
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
    }
  }
};

CPHHistory.prototype.createFutureEntry = function (entry) {
  return {
    user_uuid: entry.user_uuid,
    name: entry.name,
    args: entry.args
  };
};

CPHHistory.prototype.canGoto = function (user, amount) {
  var pasts = this.pasts[user.uuid] = this.pasts[user.uuid] || [];
  var futures = this.futures[user.uuid] = this.futures[user.uuid] || [];
  return amount >= 0
    ? futures.length > 0
    : !!pasts.find(function (past) { return this.gotoEnabled[past.name]; }.bind(this));
};

CPHHistory.prototype.back = function (user, amount) {
  if (amount > 0) {
    throw new Error('CPHHistory#back expects amount to be <= 0');
  }
  var pasts = this.pasts[user.uuid] = this.pasts[user.uuid] || [];
  var futures = this.futures[user.uuid] = this.futures[user.uuid] || [];
  amount = Math.abs(amount);
  var queue = [];
  // Past breakpoint stores the last place we went to on undo
  // This is so we can put `replay()` events back in the same spot
  // By reversing to the breakpoint for events that don't have .gotoEnabled
  // Like cursor selection, etc.
  while (
    futures.length &&
    pasts.length &&
    this.pastBreakpoint &&
    this.pastBreakpoint !== pasts[pasts.length - 1]
  ) {
    var entry = pasts.pop();
    this.removeEntry(entry);
  }
  // Now, go back the desired amount
  while (pasts.length && amount > 0) {
    var entry = pasts.pop();
    queue.unshift(entry);
    if (this.gotoEnabled[entry.name]) {
      amount--;
    }
  }
  while (queue.length) {
    var entry = queue.pop();
    futures.unshift(this.createFutureEntry(entry));
    this.removeEntry(entry);
  }
  this.pastBreakpoint = pasts[pasts.length - 1] || null;
  return this.generateHistory(pasts.length ? pasts[pasts.length - 1].uuid : null);
};

CPHHistory.prototype.generateHistory = function (uuid) {
  var entries = [];
  var found = uuid ? false : true;
  for (var i = this.operations.add.length - 1; i >= 0; i--) {
    var entry = this.operations.add[i];
    entries.unshift(entry);
    found = found || (entry.uuid === uuid);
    if (found && entry.value) {
      return entries;
    }
  }
  return entries;
};

CPHHistory.prototype.replay = function (user, amount) {
  this.pastBreakpoint = null; // Reset past breakpoint
  var pasts = this.pasts[user.uuid] = this.pasts[user.uuid] || [];
  var futures = this.futures[user.uuid] = this.futures[user.uuid] || [];
  var entries = [];
  var isValid = false;
  var initialAmount = amount;
  while (amount > 0) {
    if (!futures.length) {
      break;
    } else {
      var entry = futures.shift();
      entries.push(entry);
      if (this.gotoEnabled[entry.name]) {
        isValid = true;
        amount--;
      }
    }
  }
  // If we tried to replay but it wasn't valid, clear all futures
  if (!isValid) {
    entries = [];
    if (initialAmount > 0) {
      while (futures.length) {
        futures.shift();
      }
    }
  }
  return entries;
};
