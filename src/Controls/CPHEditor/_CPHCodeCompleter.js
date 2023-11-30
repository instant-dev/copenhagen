/**
* Autocompletion for code
* @class
*/
function CPHCodeCompleter () {
  this.suggestions = this.generateSuggestions(this.suggestionMap);
};

CPHCodeCompleter.prototype.cursorCharacter = '·';
CPHCodeCompleter.prototype.wildcardWordCharacter = '¤';
CPHCodeCompleter.prototype.wildcardPhraseCharacter = '…';
CPHCodeCompleter.prototype.wildcardReplaceCharacter = '\\$1';

CPHCodeCompleter.prototype.suggestionMap = {
  'javascript': [
    'const ',
    'const ¤ = ',
    'const {…} = ',
    'const […] = ',
    'console.log(`·Got here: A·`);',
    'console.error(`·Error·`);',
    'let ',
    'let ¤ = ',
    'let {…} = ',
    'let […] = ',
    'var ',
    'var ¤ = ',
    'var {…} = ',
    'var […] = ',
    'lib.',
    'module.exports = ',
    'module.exports = async ',
    'return ',
    'require(\'·\')',
    'class ',
    'class ¤ {·}',
    'function ',
    'function (·)',
    'function ¤ (·)',
    'function () {·}',
    'function ¤ () {·}',
    'function (…) {·}',
    'function ¤ (…) {·}',
    'if (·true·)',
    'if () {·}',
    'if (…) {·}',
    'else ',
    'else {·}',
    'else if (·true·)',
    'for (let i = 0; i < ·10·; i++)',
    'for () {·}',
    'for (…) {·}',
    'while (·true·)',
    'while () {·}',
    'while (…) {·}',
    'await ',
    'await lib.',
    'await new Promise((resolve, reject) => {·});',
    'async ',
    'async (·)',
    '() => {·}',
    '(…) => {·}',
    '/**\n * ·\n */',
    '* @param {·}',
    '* @param {…} ·paramName·',
    '* @returns {·}',
    '* @returns {…} ·returnValue·',
    'true',
    'false',
    'null',
    'new ',
    'new Promise((resolve, reject) => {·});',
    'Promise((resolve, reject) => {·});',
    'Promise.all([·]);',
    'setTimeout(() => {·}, 1);',
    'setInterval(() => {·}, 1);',
    'try {·}',
    'catch (e) {·}',
    'catch (…) {·}',
    'throw ',
    'throw new Error(`·Oops!·`);',
    'new Error(`·Oops!·`)',
    'Error(`·Oops!·`)',
    'Error(…)'
  ]
};

CPHCodeCompleter.prototype.generateSuggestions = function () {
  var suggestionMap = this.suggestionMap;
  var cursorCharacter = this.cursorCharacter;
  return Object.keys(suggestionMap).reduce(function (suggestions, language) {
    var phraseList = suggestionMap[language].map(function (value) {
      var cursorStart = value.indexOf(cursorCharacter);
      var cursorEnd = value.lastIndexOf(cursorCharacter);
      var cursorLength = 0;
      if (cursorStart !== cursorEnd) {
        cursorLength = cursorEnd - cursorStart - 1;
        value = value.slice(0, cursorEnd) + value.slice(cursorEnd + 1);
      }
      var adjust = cursorStart === -1
        ? 0
        : cursorStart - value.length + 1;
      if (adjust) {
        value = value.substr(0, value.length + adjust - 1) + value.substr(value.length + adjust);
      }
      return {
        value: value,
        adjust: adjust,
        cursorLength: cursorLength
      };
    }.bind(this));
    suggestions[language] = {
      lookup: this.generateLookupTrie(phraseList),
    };
    return suggestions;
  }.bind(this), {});
};

CPHCodeCompleter.prototype.generateLookupTrie = function (phraseList) {
  var wildcardWord = this.wildcardWordCharacter;
  var wildcardPhrase = this.wildcardPhraseCharacter;
  var root = {};
  var curNode, node, phrase, value;
  var i, j, k;
  for (i = 0; i < phraseList.length; i++) {
    phrase = phraseList[i];
    value = phrase.value;
    for (j = value.length - 1; j >= 0; j--) {
      curNode = root;
      for (k = j; k >= 0; k--) {
        char = value[k];
        curNode[char] = curNode[char] || {};
        if (char === wildcardWord || char === wildcardPhrase) {
          curNode[char][char] = curNode[char][char] || curNode[char];
        }
        curNode = curNode[char];
      }
      curNode.phrases = curNode.phrases || [];
      curNode.phrases.push({
        value: value,
        ranking: i,
        adjust: phrase.adjust,
        cursorLength: phrase.cursorLength,
        re: phrase.re
      });
    }
  }
  return root;
};

CPHCodeCompleter.prototype.complete = function (tree, value, index, subs, inWildcard) {
  index = index || 0;
  subs = subs || [];
  inWildcard = inWildcard || '';
  var wildcardWord = this.wildcardWordCharacter;
  var wildcardPhrase = this.wildcardPhraseCharacter;
  var wildcardReplace = this.wildcardReplaceCharacter;
  var char;
  var results = [];
  var node = tree;
  for (var i = value.length - 1; i >= 0; i--) {
    index++;
    var char = value[i];
    if (node[wildcardWord]) {
      if (char.match(/[0-9a-z_$]/i)) {
        var newSubs = subs.slice();
        if (inWildcard) {
          newSubs[0] = char + newSubs[0];
        } else {
          newSubs.unshift(char);
        }
        results = results.concat(
          this.complete(node[wildcardWord], value.substr(0, i), index - 1, newSubs, wildcardWord)
        );
      }
    }
    if (node[wildcardPhrase]) {
      if (char.match(/[^\(\)\[\]\{\}\"\'\`]/i)) {
        var newSubs = subs.slice();
        if (inWildcard) {
          newSubs[0] = char + newSubs[0];
        } else {
          newSubs.unshift(char);
        }
        results = results.concat(
          this.complete(node[wildcardPhrase], value.substr(0, i), index - 1, newSubs, wildcardPhrase)
        );
      }
    }
    if (node[char]) {
      inWildcard = '';
      if (node.phrases && (char === ' ')) {
        results = results.concat(
          node.phrases.map(function (p) {
            var curSubs = subs.slice();
            return {
              value: p.value.replace(
                new RegExp('(' + [wildcardWord, wildcardPhrase, wildcardReplace].join('|') + ')', 'gi'),
                function ($0) { return curSubs.shift() || ''; }
              ),
              ranking: p.ranking,
              adjust: p.adjust,
              offset: index - 1 + subs.join('').length,
              cursorLength: p.cursorLength
            };
          })
        );
      }
      node = node[char];
    } else {
      break;
    }
  }
  if (node.phrases && (i < 0 || value[i] === ' ')) {
    (i < 0) && index++;
    results = results.concat(
      node.phrases.map(function (p) {
        var curSubs = subs.slice();
        return {
          value: p.value.replace(
            new RegExp('(' + [wildcardWord, wildcardPhrase, wildcardReplace].join('|') + ')', 'gi'),
            function ($0) { return curSubs.shift() || ''; }
          ),
          ranking: p.ranking,
          adjust: p.adjust,
          offset: index - 1 + subs.join('').length,
          cursorLength: p.cursorLength
        };
      })
    );
  }
  return results
    .sort(function (p1, p2) { return p2.offset - p1.offset || p1.ranking - p2.ranking; })
    .filter(function (p) { return p.offset < p.value.length; });
};

CPHCodeCompleter.prototype.suggest = function (line, language, endOffset) {
  endOffset = parseInt(endOffset) || 0;
  var suggestions = this.suggestions[language];
  if (!suggestions) {
    return;
  }
  line = line.substring(0, line.length).replace(/^\s+/, '');
  var phrases = this.complete(suggestions.lookup, line);
  if (!phrases.length) {
    return;
  }
  var suggest = phrases[0];
  return  {
    value: suggest.value.substr(suggest.offset + endOffset),
    adjust: suggest.adjust,
    cursorLength: suggest.cursorLength
  };
};
