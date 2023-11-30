const fs = require('fs');
const CPHUser_text = fs.readFileSync(__dirname + '/../../src/Controls/CPHEditor/CPHUser/CPHUser.js').toString();
const CPHCursor_text = fs.readFileSync(__dirname + '/../../src/Controls/CPHEditor/CPHCursor/CPHCursor.js').toString();
const CPHLanguages_text = fs.readFileSync(__dirname + '/../../src/Controls/CPHEditor/_CPHLanguages.js').toString();

const ImportedCPHCursor = new Function(`${CPHCursor_text}; return CPHCursor;`)();
const ImportedCPHUser = new Function('CPHCursor', `${CPHUser_text}; return CPHUser;`)(ImportedCPHCursor);
const ImportedCPHLanguages = new Function(`${CPHLanguages_text}; return CPHLanguages;`)();

module.exports = class MPTextReconstructor {

  initialize (project) {
    this.clientLookup = {};
    this.userLookup = {};
    this.users = [];
    // Load active users into cursorMap
    project.listAllUsers().forEach(user => {
      this.clientLookup[user.uuid] = user;
      this.getUser(user.uuid);
    });
  }

  getUser (uuid, cursorMap) {
    let user = this.userLookup[uuid];
    if (!user) {
      user = new ImportedCPHUser(this.clientLookup[uuid] || {uuid: uuid, username: '-'});
      this.userLookup[user.uuid] = user;
      this.users.push(user);
    }
    return user;
  }

  getLanguageDictionary (lang) {
    return ImportedCPHLanguages[lang] || ImportedCPHLanguages['text'];
  }

  serverUserAction (user, name, args, lang, value) {
    let actionResult = user.action(this.users, name, args, this.getLanguageDictionary(lang), value);
    return actionResult.value;
  }

  // Reconstructs the value of a file from the history.
  // Stores data on operations based on textOperations.cacheGap
  reconstruct (project, file) {
    this.initialize(project);
    return this.reconstructTextOperations(file.textOperations);
  }

  reconstructTextOperations (textOperations, index = null) {
    let addOperations = textOperations.add.slice();
    let value = textOperations.getInitialValue();
    let opIndex = index === null
      ? addOperations.length - 1
      : Math.min(addOperations.length - 1, Math.max(0, parseInt(index) || 0));
    for (; opIndex > 0; opIndex--) {
      let op = addOperations[opIndex];
      if (op.hasOwnProperty('value')) {
        value = op.value;
        this.users.forEach(user => {
          let cursors = op.cursorMap && op.cursorMap[user.uuid];
          if (cursors && cursors.length) {
            user.loadCursors(cursors);
          }
        });
        break;
      }
    }
    let entries = addOperations.slice(opIndex);
    for (let i = 0; i < entries.length; i++) {
      let userAction = entries[i];
      // force and update if index !== null, it means we're undoing something
      textOperations.updateOperationWithValue(userAction.uuid, this.users, value, index !== null);
      let user = this.getUser(userAction.user_uuid);
      value = this.serverUserAction(user, userAction.name, userAction.args[0], userAction.args[1], value);
    }
    return {
      revision: textOperations.currentRevision(),
      value: value
    };
  }


}
