function CPHCursor (start, end, offset) {
  this.offset = parseInt(offset) || 0; // use for smart line offsets
  this.select(start, end);
};

CPHCursor.fromObject = function (obj) {
  return new CPHCursor(obj.start, obj.end, obj.offset);
};

CPHCursor.prototype.toObject = function () {
  return {start: this.pivot, end: this.position, offset: this.offset};
};

CPHCursor.prototype.clone = function () {
  return new CPHCursor(this.pivot, this.position, this.offset);
};

CPHCursor.prototype.move = function (delta) {
  this.select(this.pivot + delta, this.position + delta);
};

CPHCursor.prototype.highlight = function (delta) {
  this.select(this.pivot, this.position + delta);
};

CPHCursor.prototype.selectRelative = function (deltaLeft, deltaRight) {
  deltaLeft = deltaLeft || 0;
  deltaRight = deltaRight || 0;
  if (this.direction() === 'ltr') {
    this.select(this.pivot + deltaLeft, this.position + deltaRight);
  } else {
    this.select(this.pivot + deltaRight, this.position + deltaLeft);
  }
};

CPHCursor.prototype.select = function (start, end) {
  this.pivot = start = start === undefined ? 0 : start;
  this.position = end === undefined ? start : end;
  this.selectionStart = Math.min(this.pivot, this.position);
  this.selectionEnd = Math.max(this.pivot, this.position);
};

CPHCursor.prototype.adjustFromRange = function (range) {
  var width = this.selectionEnd - this.selectionStart;
  var rangeWidth = range.selectionEnd - range.selectionStart;
  if (this.selectionStart > range.selectionEnd) {
    // cursor after range
    return [range.result.offset, range.result.offset];
  } else if (this.selectionStart > range.selectionStart && this.selectionStart <= range.selectionEnd) {
    // cursor start within range
    if (this.selectionEnd <= range.selectionEnd) {
      // cursor entirely inside of range
      return [
        range.selectionStart - this.selectionStart,
        range.selectionStart - this.selectionEnd
      ];
    }  else {
      // cursor end outside of range
      return [
        range.selectionStart - this.selectionStart + range.result.selectRelative[0],
        range.result.offset
      ];
    }
  } else if (this.selectionStart <= range.selectionStart && this.selectionEnd > range.selectionStart) {
    if (this.selectionEnd <= range.selectionEnd) {
      // cursor start before range, end in range
      return [
        0,
        range.selectionStart - this.selectionEnd + range.result.selectRelative[0]
      ];
    } else {
      // cursor start before range, end after range
      return [
        0,
        range.result.offset
      ];
    }
  } else {
    return [0, 0];
  }
};

CPHCursor.prototype.calculateNoOp = function () {
  return {
    selectRelative: [0, 0],
    offset: 0
  };
};

CPHCursor.prototype.calculateRemoveText = function (value, args) {
  var amount = parseInt(args[0]);
  if (isNaN(amount)) {
    throw new Error('"RemoveText" expects a number');
  }
  var selectRelative = [0, 0];
  var selectionStart = this.selectionStart;
  var selectionEnd = this.selectionEnd;
  var offset = 0;
  if (this.width()) {
    value = value.slice(0, selectionStart) + value.slice(selectionEnd);
    selectRelative[1] = selectionStart - selectionEnd;
    offset = selectionStart - selectionEnd;
  } else if (amount > 0) {
    value = value.slice(0, selectionStart) + value.slice(selectionEnd + amount);
    offset = -amount;
  } else if (amount < 0) {
    if (selectionStart + amount < 0) {
      amount = -selectionStart;
    }
    value = value.slice(0, selectionStart + amount) + value.slice(selectionEnd);
    selectRelative[0] = amount;
    selectRelative[1] = amount;
    offset = amount;
  }
  return {
    value: value,
    selectRelative: selectRelative,
    offset: offset
  };
};

CPHCursor.prototype.calculateInsertText = function (value, args, lang) {
  var insertValue = (args[0] || '') + ''; // coerce to string
  var selectAll = args[1] === true;
  var adjust = parseInt(args[1]) || 0;
  var cursorLength = parseInt(args[2]) || 0;
  var tabChar = (lang && lang.tabChar) || ' ';
  var tabWidth = Math.max(1, (lang && parseInt(lang.tabWidth)) || 2);
  var forwardComplements = (lang && lang.forwardComplements) || {};
  var replaceValue = value.slice(this.selectionStart, this.selectionEnd);
  // Automatically surround highlighted text with [complement brackets]
  if (this.width() && forwardComplements[insertValue] && !adjust && !cursorLength) {
    var start = insertValue;
    var end = forwardComplements[insertValue];
    var val = value.slice(this.selectionStart, this.selectionEnd);
    insertValue = start + val + end;
    adjust = -val.length - 1;
    cursorLength = val.length;
  } else {
    var originalLines = insertValue.split('\n');
    var lines = originalLines.slice();
    var linePrefix = value.slice(0, this.selectionStart).split('\n').pop();
    if (lines.length === 1) {
      if (insertValue === '\t') {
        insertValue = tabChar.repeat(tabWidth);
      }
      if (insertValue === tabChar.repeat(tabWidth)) {
        insertValue = tabChar.repeat(tabWidth - (linePrefix.length % tabWidth));
      }
    } else if (lines.length > 1) {
      lines = lines.map(function (line, i) {
        var tabs = 0;
        var spaces = 0;
        line = line.replace(/^[\t ]+/gi, function ($0) {
          tabs += $0.split('\t').length - 1;
          spaces += $0.split(' ').length - 1;
          return '';
        });
        return {
          count: (tabs * tabWidth) + spaces,
          line: line
        };
      });
      // Set first line to no tab
      lines[0].count = 0;
      // Get minimum tab count without starting line
      // If something has 0, we want to back adjust all other lines to the
      // minimum otherwise
      var minCount = Math.min.apply(
        Math,
        lines
          .slice(1)
          .filter(function (l) { return l.line.length > 0; })
          .map(function (l) { return l.count; })
      );
      if (minCount === Infinity) {
        minCount = 0;
      }
      lines = lines.map(function (lineData) {
        lineData.count = lineData.count
          ? lineData.count - minCount
          : lineData.count;
        return lineData;
      });
      // Greatest common denominator, euclidean formula
      var gcd = function(a, b) {
        return !b ? a : gcd(b, a % b);
      }
      // We grab the GCD between line length to do auto-tab adjustment
      var divisor = lines.reduce(function (divisor, lineData, i) {
        return lineData.count
          ? gcd(lineData.count, divisor)
          : divisor;
      }, 0);
      if (divisor > 1) {
        lines = lines.map(function (lineData) {
          lineData.count = (lineData.count / divisor) * tabWidth;
          return lineData;
        });
      }
      var indent = linePrefix.replace(/^((\s*)?([\*\-]\s)?).*$/, '$1');
      lines = lines.map(function (lineData, i) {
        var count = Math.max(0, lineData.count);
        var tabs = Math.floor(count / tabWidth);
        var spaces = count % tabWidth;
        return (i > 0 ? indent : '') +
          tabChar.repeat(tabWidth).repeat(tabs) + ' '.repeat(spaces) + lineData.line;
      });
      insertValue = lines.join('\n');
      if (adjust < 0) {
        // Make sure the expected cursor adjustment matches line adjustments
        var originalLinesAdjusted = originalLines.join('\n').slice(0, adjust).split('\n');
        var index = originalLinesAdjusted.length - 1;
        var adjustLineOffset =
          originalLinesAdjusted[index].length - originalLines[index].length;
        if (lines.length >= index + 1) {
          adjust = -lines.slice(index + 1).join('\n').length - 1 + adjustLineOffset;
        } else {
          adjust = adjustLineOffset;
        }
      }
    }
  }
  value = value.slice(0, this.selectionStart) + insertValue + value.slice(this.selectionEnd);
  if (selectAll) {
    adjust = -insertValue.length;
    cursorLength = insertValue.length;
  }
  return {
    value: value,
    selectRelative: [insertValue.length + adjust, insertValue.length - replaceValue.length + adjust + cursorLength],
    offset: insertValue.length - (this.selectionEnd - this.selectionStart)
  }
};

CPHCursor.prototype.insertLines = function (value, args) {
  var insertValue = args[0];
  var sel = this.getSelectionInformation(value);
  var replaceValue = value.slice(sel.linesStartIndex, sel.linesEndIndex);
  var selectRelative = [
    -sel.linesPrefix.length,
    sel.linesSuffix.length + insertValue.length - replaceValue.length
  ];
  var newLines = insertValue.split('\n');
  var firstLineSuffix = sel.lines[0].slice(sel.linesPrefix.length);
  var newFirstLine = newLines[0];
  if (newFirstLine.endsWith(firstLineSuffix)) {
    selectRelative[0] += newFirstLine.length - firstLineSuffix.length;
   }
  var lastLineSuffix = sel.lines[sel.lines.length - 1].slice(sel.lines[sel.lines.length - 1].length - sel.linesSuffix.length);
  var newLastLine = newLines[newLines.length - 1];
  if (newLastLine.endsWith(lastLineSuffix)) {
    selectRelative[1] -= lastLineSuffix.length;
  }
  value = value.slice(0, sel.linesStartIndex) + insertValue + value.slice(sel.linesEndIndex);
  return {
    value: value,
    selectRelative: selectRelative,
    offset: insertValue.length - (sel.linesEndIndex - sel.linesStartIndex)
  };
};

CPHCursor.prototype.calculateAddIndent = function (value, args, lang) {
  var sel = this.getSelectionInformation(value);
  var tabChar = (lang && lang.tabChar) || ' ';
  var tabWidth = Math.max(1, (lang && parseInt(lang.tabWidth)) || 2);
  var newLines = sel.lines.map(function (line, i) {
    var count = 0;
    var len = 0;
    while (line[len] === tabChar) {
      len++;
    }
    if (len === line.length) {
      return '';
    } else {
      count = tabWidth - (len % tabWidth);
      return tabChar.repeat(count) + line;
    }
  }.bind(this));
  return this.insertLines(value, [newLines.join('\n')]);
};

CPHCursor.prototype.calculateRemoveIndent = function (value, args, lang) {
  var sel = this.getSelectionInformation(value);
  var tabChar = (lang && lang.tabChar) || ' ';
  var tabWidth = Math.max(1, (lang && parseInt(lang.tabWidth)) || 2);
  var newLines = sel.lines.map(function (line, i) {
    var count = 0;
    var len = 0;
    while (line[len] === tabChar) {
      len++;
    }
    if (!len) {
      return line;
    } else if (len === line.length) {
      return '';
    } else {
      count = (len % tabWidth) || tabWidth;
      return line.slice(count);
    }
  }.bind(this));
  return this.insertLines(value, [newLines.join('\n')]);
};

CPHCursor.prototype.calculateToggleComment = function (value, args, lang) {
  var sel = this.getSelectionInformation(value);
  var tabChar = (lang && lang.tabChar) || ' ';
  var tabWidth = Math.max(1, (lang && parseInt(lang.tabWidth)) || 2);
  var commentString = (lang && lang.commentString) || '//';
  var newLines = [];
  var index = sel.lines.findIndex(function (line, i) {
    var count = 0;
    var len = 0;
    while (line[len] === tabChar) {
      len++;
    }
    if (len === line.length) {
      return false;
    } else if (!line.slice(len).startsWith(commentString)) {
      return true;
    } else {
      return false;
    }
  });
  var addComments = index > -1;
  var newLines = sel.lines.map(function (line, i) {
    var count = 0;
    var len = 0;
    while (line[len] === tabChar) {
      len++;
    }
    if (len === line.length) {
      return '';
    } else if (addComments) {
      return line.slice(0, len) + commentString + ' ' + line.slice(len);
    } else {
      var suffix = line.slice(len + commentString.length);
      if (suffix.startsWith(' ')) {
        suffix = suffix.slice(1);
      }
      return line.slice(0, len) + suffix;
    }
  }.bind(this));
  return this.insertLines(value, [newLines.join('\n')]);
};

CPHCursor.prototype.width = function () {
  return this.selectionEnd - this.selectionStart;
};

CPHCursor.prototype.clamp = function (value) {
  if (typeof value !== 'string') {
    throw new Error('Clamp expects string value');
  }
  this.pivot = Math.min(Math.max(0, this.pivot), value.length);
  this.position = Math.min(Math.max(0, this.position), value.length);
  this.select(this.pivot, this.position);
};

CPHCursor.prototype.getSelectionInformation = function (value) {
  value = value || '';
  var selStart = this.selectionStart;
  var selEnd = this.selectionEnd;
  var pre = value.slice(0, selStart);
  var post = value.slice(selEnd);
  var startIndex = pre.lastIndexOf('\n') + 1;
  var endIndex = (post + '\n').indexOf('\n');
  var lines = value.slice(startIndex, endIndex + selEnd).split('\n');
  return {
    value: value.slice(selStart, selEnd),
    start: selStart,
    end: selEnd,
    length: selEnd - selStart,
    lineNumber: value.slice(0, selStart).split('\n').length,
    column: value.slice(0, selStart).split('\n').pop().length,
    lines: lines,
    linesStartIndex: startIndex,
    linesEndIndex: endIndex + selEnd,
    linesPrefix: pre.slice(startIndex),
    linesSuffix: post.slice(0, endIndex),
    currentLinePrefix: value.slice(startIndex, selStart),
    currentLineSuffix: value.slice(selEnd, endIndex + selEnd)
  };
};

CPHCursor.prototype.direction = function () {
  if (this.pivot <= this.position) {
    return 'ltr';
  } else {
    return 'rtl';
  }
};
