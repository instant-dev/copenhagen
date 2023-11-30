var CPHLanguages = {
  'text': {
    tabChar: ' ',
    tabWidth: 2,
    stringComplements: {
      '"': '"',
    },
    forwardComplements: {
      '{': '}',
      '(': ')',
      '[': ']',
      '"': '"'
    }
  },
  'css': {
    tabChar: ' ',
    tabWidth: 2,
    comments: {
      '/*': '*/'
    },
    blocks: {
      '{': '}'
    },
    tabComplements: {
      '{': '}'
    },
    stringComplements: {
      '"': '"',
    },
    forwardComplements: {
      '{': '}',
      '(': ')',
      '[': ']',
      '"': '"'
    }
  },
  'javascript': {
    tabChar: ' ',
    tabWidth: 2,
    commentString: '//',
    comments: {
      '/*': '*/',
      '//': '\n'
    },
    multiLineStrings: {
      '`': '`'
    },
    tabComplements: {
      '{': '}',
      '(': ')',
      '[': ']'
    },
    stringComplements: {
      '\'': '\'',
      '"': '"',
      '`': '`'
    },
    forwardComplements: {
      '{': '}',
      '(': ')',
      '[': ']',
      '\'': '\'',
      '"': '"',
      '`': '`'
    }
  },
  'json': {
    tabChar: ' ',
    tabWidth: 2,
    tabComplements: {
      '{': '}',
      '[': ']',
    },
    stringComplements: {
      '"': '"',
    },
    forwardComplements: {
      '{': '}',
      '[': ']',
      '"': '"',
    }
  },
  'markdown': {
    tabChar: ' ',
    tabWidth: 2,
    multiLineStrings: {
      '```': '```'
    },
    tabComplements: {
      '{': '}',
      '(': ')',
      '[': ']'
    },
    stringComplements: {
      '\'': '\'',
      '"': '"',
      '`': '`'
    },
    forwardComplements: {
      '{': '}',
      '(': ')',
      '[': ']',
      '\'': '\'',
      '"': '"',
      '*': '*',
      '`': '`'
    }
  }
};

Object.keys(CPHLanguages).forEach(function (name) {
  var language = CPHLanguages[name];
  language.tabChar = language.tabChar || ' ';
  language.tabWidth = language.tabWidth || 2;
  language.commentString = language.commentString || '';
  language.comments = language.comments || {};
  language.blocks = language.blocks || {};
  language.multiLineStrings = language.multiLineStrings || {};
  language.tabComplements = language.tabComplements || {};
  language.stringComplements = language.stringComplements || {};
  language.forwardComplements = language.forwardComplements || {};
  language.reverseComplements = {};
  Object.keys(language.forwardComplements).forEach(function (key) {
    language.reverseComplements[language.forwardComplements[key]] = key;
  });
});
