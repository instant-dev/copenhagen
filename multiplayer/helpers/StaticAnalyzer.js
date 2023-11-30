// do a thing

const FunctionScript = require('functionscript');
const FunctionParser = FunctionScript.FunctionParser;

const babelParser = require('@babel/parser');

const parseProviders = require('./StaticAnalyzer.parseProviders.js');
const parseProvidersAsync = require('./StaticAnalyzer.parseProviders.async.js');
const samples = require('./StaticAnalyzer.samples.js');

const PREPEND = 'async () => {';
const APPEND = '\n}';
const SAMPLE_SRC = samples.DEFAULT;

/**
* Analyze source code of a function
* @param {string} pathname The name of the file to validate
* @param {string} src The sourcecode to validate
* @param {object} params Key-value pairs of execution parameters
* @param {boolean} sample Whether to run a sample
* @returns {object} Function body to execute, list of providers
*/
module.exports = class StaticAnalyzer {

  async analyze (pathname = '', src = '', params = {}, sample = false) {
    src = sample ? SAMPLE_SRC : src;
    let osrc = src;
    src = `${PREPEND}${src}${APPEND}`;
    let fmtsrc = src;
    let AST;
    try {
      AST = babelParser.parse(src, {plugins: ['objectRestSpread']});
    } catch (e) {
      let loc = e.loc;
      if (loc.line === 1) {
        loc.column = loc.column - PREPEND.length;
      }
      if (loc.column === 0 && loc.line > 1) {
        loc.column = -1;
        while (loc.column === -1 && loc.line > 1) {
          loc.line -= 1;
          loc.column = osrc.split('\n')[loc.line - 1].length - 1;
        }
        loc.column = Math.max(0, loc.column);
      }
      let message = e.message.replace(/\((.*?)\)$/, () => `(${loc.line}:${loc.column})`);
      return {
        error: {
          message: message,
          position: {
            line: loc.line,
            column: loc.column
          }
        }
      };
    }
    let body = AST.program.body[AST.program.body.length - 1];
    let lastBody = body.expression && body.expression.body && body.expression.body.body && body.expression.body.body[body.expression.body.body.length - 1];
    let lastDirective = body.expression.body.directives[body.expression.body.directives.length - 1];
    let last = lastBody || lastDirective;
    let schema = [];
    var leadingComments = last && last.leadingComments;
    let lastExpr = last && (last.type === 'ExpressionStatement') && last.expression;
    let exportStatement = null;
    let exportComments = null;
    if (
      lastExpr &&
      lastExpr.type === 'AssignmentExpression' &&
      lastExpr.operator === '=' &&
      lastExpr.left.type === 'MemberExpression' &&
      lastExpr.left.object.name === 'module' &&
      lastExpr.left.property.name === 'exports'
    ) {
      src = osrc;
      exportStatement = {
        start: lastExpr.start - PREPEND.length,
        end: lastExpr.end - PREPEND.length,
        assignments: null,
        body: null,
        schema: [],
      };
      let functionExpression = lastExpr.right;
      if (functionExpression.type === 'ArrowFunctionExpression' || functionExpression.type === 'FunctionExpression') {
        exportStatement.assignments = {};
        exportStatement.body = {
          start: functionExpression.body.start - PREPEND.length,
          end: functionExpression.body.end - PREPEND.length
        };
        let params = functionExpression.params;
        let lastParam = params[params.length - 1];
        exportStatement.assignments.start = src.indexOf('(', functionExpression.start - PREPEND.length) + 1;
        exportStatement.assignments.end = lastParam ? lastParam.end - PREPEND.length : exportStatement.assignments.start;
        exportStatement.assignments.list = params.map(function (param) {
          if (param.type === 'Identifier') {
            return {
              name: param.name,
              assignment: ''
            };
          } else if (param.type === 'AssignmentPattern' && param.left.type === 'Identifier') {
            return {
              name: param.left.name,
              assignment: src.slice(param.left.end - PREPEND.length, param.right.end - PREPEND.length)
            }
          } else {
            return {
              name: '',
              assignment: src.slice(param.start - PREPEND.length, param.end - PREPEND.length)
            };
          }
        });
      }
      try {
        let fp = new FunctionParser();
        let def = fp.parseDefinition(pathname, Buffer.from(src), 'functions');
        schema = def.params.slice();
        def.context && schema.push({name: 'context', type: 'object'});
        exportStatement.schema = schema;
      } catch (e) {
        exportStatement.error = {message: e.message};
      }
      if (leadingComments) {
        let lastComment = leadingComments.pop();
        if (lastComment.type === 'CommentBlock' && lastComment.value[0] === '*') {
          exportComments = {
            start: lastComment.start - PREPEND.length,
            end: lastComment.end - PREPEND.length,
            value: lastComment.value
          };
          try {
            let commentParser = new FunctionParser.commentParsers.nodejs()
            let def = commentParser.parse(pathname, exportComments.value);
            exportComments.definition = def;
          } catch (e) {
            exportComments.error = {message: e.message};
          }
        }
      }
    } else {
      src = `module.exports = ${src}`;
    }
    let parsed;
    try {
      parsed = await parseProvidersAsync(AST);
    } catch (e) {
      let points = e.message.split('(').pop().slice(0, -1);
      points = points.split(',').map(n => Math.max(0, Math.min(parseInt(n), fmtsrc.length)));
      if (points.length === 2) {
        console.error(e.message);
        points[0] = Math.max(0, points[0] - 32);
        points[1] = Math.min(fmtsrc.length, points[1] + 32);
        console.error(`Source:\n${fmtsrc.slice(points[0], points[1])}`);
      }
      return {
        error: {
          message: e.message,
          position: {
            line: 1,
            column: 0
          }
        }
      };
    }
    return {
      src: src,
      providers: parsed.providers,
      calls: parsed.calls,
      imports: parsed.imports,
      suggestions: parsed.suggestions,
      exports: exportStatement,
      comments: exportComments
    }
  }

}
