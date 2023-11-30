function readBody (nodes, depth, assignments, tokens, suggestions) {
  depth = depth || 0;
  assignments = [].slice.call(assignments || []);
  tokens = tokens || [];
  suggestions = suggestions || [];
  for (let i = 0; i < nodes.length; i++) {
    let body = readNode(nodes[i], assignments, tokens, suggestions);
    readBody(body, depth + 1, assignments, tokens, suggestions);
  }
  return {
    tokens: tokens,
    suggestions: suggestions
  };
};

function readNode (node, assignments, tokens, suggestions) {
  let nodes;
  switch (node && node.type) {
    case 'MemberExpression':
    case 'Identifier':
      let token = readMemberWithAssignments(null, node, assignments, tokens, suggestions);
      tokens.push(token);
      return [];
      break;
    case 'UnaryExpression':
      return readNode(node.argument, assignments, tokens, suggestions);
      break;
    case 'BinaryExpression':
      return [].concat(
        readNode(node.left, assignments, tokens, suggestions),
        readNode(node.right, assignments, tokens, suggestions)
      );
      break;
    case 'ObjectPattern':
      // TODO: Understand ObjectPattern assignments
      return node.properties.map(node => {
        return readNode(node, assignments, tokens, suggestions)
      });
      break;
    case 'FunctionDeclaration':
      // TODO: Understand function assignments
      //   and handle node.params (arguments)
      return [].concat(
        readNode(node.id, assignments, tokens, suggestions),
        readNode(node.body, assignments, tokens, suggestions)
      );
      break;
    case 'AssignmentExpression':
    case 'VariableDeclarator':
      let leftNode = node.left || node.id;
      let rightNode = node.right || node.init;
      let lhs = readAssignment(null, leftNode);
      let rhs = readAssignment(lhs, rightNode, assignments, tokens, suggestions);
      if (rightNode && lhs) {
        switch (rightNode.type) {
          case 'MemberExpression':
          case 'Identifier':
            assignments.push({
              left: lhs,
              right: rhs
            });
            flattenAssignments(lhs, rhs).forEach(entry => suggestions.push(entry));
            break;
          case 'AwaitExpression':
          case 'ObjectExpression':
            flattenAssignments(lhs, rhs).forEach(entry => suggestions.push(entry));
            break;
          case 'ArrayExpression':
          case 'TemplateElement':
          case 'NumericLiteral':
          case 'StringLiteral':
          case 'BooleanLiteral':
            suggestions.push(lhs.concat(rhs));
            break;
        }
      }
      return [].concat(
        readNode(leftNode, assignments, tokens, suggestions),
        readNode(rightNode, assignments, tokens, suggestions)
      );
      break;
    case 'CallExpression':
    case 'NewExpression':
      var length = tokens.length;
      nodes = readNode(node.callee, assignments, tokens, suggestions);
      if (tokens.length > length) {
        var activeToken = tokens[tokens.length - 1];
        // Populate with only first pass on call to prevent identifier()()
        if (!activeToken.arguments) {
          activeToken.calleeIndex = activeToken.identifiers.length - 1;
          activeToken.arguments = (node.arguments || []).map(argument => readArgument(argument));
        }
      }
      [].slice.call(node.arguments || []).forEach(argument => {
        nodes = nodes.concat(readNode(argument, assignments, tokens, suggestions));
      });
      return nodes;
      break;
    case 'ExpressionStatement':
      return readNode(node.expression, assignments, tokens, suggestions);
      break;
    case 'AwaitExpression':
    case 'ReturnStatement':
      return readNode(node.argument, assignments, tokens, suggestions);
      break;
    case 'IfStatement':
      return [].concat(
        readNode(node.test, assignments, tokens, suggestions),
        readNode(node.consequent, assignments, tokens, suggestions),
        readNode(node.alternate, assignments, tokens, suggestions)
      );
      break;
    case 'WhileStatement':
      return [].concat(
        readNode(node.test, assignments, tokens, suggestions),
        readNode(node.body, assignments, tokens, suggestions)
      );
      break;
    case 'DoWhileStatement':
      return [].concat(
        readNode(node.body, assignments, tokens, suggestions),
        readNode(node.test, assignments, tokens, suggestions)
      );
      break;
    case 'SwitchStatement':
      return [].concat(
        readNode(node.discriminant, assignments, tokens, suggestions),
        ...node.cases.map(node => readNode(node, assignments, tokens, suggestions))
      );
      break;
    case 'SwitchCase':
      return [].concat(
        readNode(node.consequent, assignments, tokens, suggestions),
        readNode(node.text, assignments, tokens, suggestions)
      );
      break;
    case 'ForInStatement':
      return [].concat(
        readNode(node.left, assignments, tokens, suggestions),
        readNode(node.right, assignments, tokens, suggestions),
        readNode(node.body, assignments, tokens, suggestions)
      );
      break;
    case 'ClassDeclaration':
    case 'ClassMethod':
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
    case 'ForStatement':
      return readNode(node.body, assignments, tokens, suggestions);
      break;
    case 'VariableDeclaration':
      return node.declarations.reduce((body, decl) => {
        return body.concat(readNode(decl, assignments, tokens, suggestions));
      }, []);
      break;
    case 'BlockStatement':
    case 'ClassBody':
      return node.body || [];
      break;
    case 'TryStatement':
      nodes = [];
      node.block && (nodes = nodes.concat(readNode(node.block, assignments, tokens, suggestions)));
      node.handler && (nodes = nodes.concat(readNode(node.handler, assignments, tokens, suggestions)));
      return nodes;
      break;
    case 'CatchClause':
      nodes = [];
      node.param && (nodes = nodes.concat(readNode(node.param, assignments, tokens, suggestions)));
      node.body && (nodes = nodes.concat(readNode(node.body, assignments, tokens, suggestions)));
      return nodes;
      break;
    case 'ThrowStatement':
      return readNode(node.argument, assignments, tokens, suggestions);
      break;
    case 'ArrayExpression':
      return [].concat.apply(
        [],
        node.elements.map(element => readNode(element, assignments, tokens, suggestions))
      );
      break;
    case 'ObjectExpression':
      return [].concat.apply(
        [],
        node.properties.map(property => readNode(property, assignments, tokens, suggestions))
      );
      break;
    case 'ObjectProperty':
    case 'ClassProperty':
      return [].concat(
        readNode(node.key, assignments, tokens, suggestions),
        readNode(node.value, assignments, tokens, suggestions)
      );
      break;
    case 'ObjectMethod':
      return [].concat(
        readNode(node.key, assignments, tokens, suggestions),
        readNode(node.body, assignments, tokens, suggestions)
      );
      break;
    case 'TemplateLiteral':
      return [].concat.apply(
        [],
        [].concat(
          node.expressions.map(expression => readNode(expression, assignments, tokens, suggestions)),
          node.quasis.map(quasi => readNode(quasi, assignments, tokens, suggestions))
        )
      );
      break;
    case 'TaggedTemplateExpression':
      return [].concat(
        readNode(node.tag, assignments, tokens, suggestions),
        readNode(node.quasi, assignments, tokens, suggestions)
      );
      break;
    case 'LogicalExpression':
      return [].concat(
        readNode(node.left, assignments, tokens, suggestions),
        readNode(node.right, assignments, tokens, suggestions)
      );
      break;
    case 'ConditionalExpression':
      return [].concat(
        readNode(node.test, assignments, tokens, suggestions),
        readNode(node.consequent, assignments, tokens, suggestions),
        readNode(node.alternate, assignments, tokens, suggestions)
      );
      break;
    case 'UpdateExpression':
      return readNode(node.argument, assignments, tokens, suggestions)
      break;
    case 'SequenceExpression':
      return [].concat(
        ...node.expressions.map(expr => readNode(expr, assignments, tokens, suggestions))
      );
      break;
    case 'SpreadElement':
      return readNode(node.argument, assignments, tokens, suggestions);
      break;
    case 'LabeledStatement':
      return readNode(node.body, assignments, tokens, suggestions);
      break;
    case 'ThisExpression':
    case 'TemplateElement':
    case 'NumericLiteral':
    case 'StringLiteral':
    case 'BooleanLiteral':
    case 'NullLiteral':
    case 'RegExpLiteral':
    case 'EmptyStatement':
    case 'BreakStatement':
    case null:
    case undefined:
      return [];
      break;
    default:
      console.log('UNKNOWN NODE :: ', node);
      return [];
      break;
  }
};

function flattenAssignments (lhs, rhs, prefix, list, depth) {
  prefix = prefix || [];
  list = list || [];
  depth = parseInt(depth) || 0;
  let items = lhs.concat(rhs);
  let index = 0;
  while (typeof items[index] === 'string') {
    prefix.push(items[index++]);
  }
  while (Array.isArray(items[index])) {
    flattenAssignments([], items[index++], prefix.slice(), list, depth + 1);
  }
  if (index === items.length - 1) {
    list.push(prefix.concat(items[index]));
  } else if (items.length === 1) {
    list.push(prefix.concat(null));
  }
  return list;
};

function readArgument (node) {
  switch (node.type) {
    case 'StringLiteral':
      return node.value;
      break;
    case 'TemplateLiteral':
      let quasis = node.quasis.map(node => readArgument(node));
      return quasis.indexOf(undefined) === -1
        ? quasis.join('')
        : undefined
      break;
    case 'TemplateElement':
      return node.value.raw;
      break;
    default:
      return undefined;
      break;
  }
}

function readAssignment (lhs, node, assignments, tokens, suggestions) {
  switch (node && node.type) {
    case 'MemberExpression':
    case 'Identifier':
      let token = readMemberWithAssignments(lhs, node, assignments || [], tokens || [], suggestions || []);
      let identifiers = token.identifiers.map(name => {
        let list = (suggestions || [])
          .filter(s => s[0] === name && (!s[1] || !s[1].callee || !Array.isArray(s[1].callee[0])))
          .map(s => s.slice(1));
        return list.length
          ? list
          : name;
      });
      return identifiers;
      break;
    case 'CallExpression':
      return readAssignment(null, node.callee, assignments || [], tokens || [], suggestions || []);
      break;
    case 'AwaitExpression':
      return {callee: readAssignment(lhs, node.argument, assignments || [], tokens || [], suggestions || [])};
      break;
    case 'ObjectExpression':
      return readObjectAssignment(lhs, node, assignments, tokens, suggestions);
      break;
  }
  return null;
};

function readObjectAssignment (lhs, node, assignments, tokens, suggestions) {
  if (node.type !== 'ObjectExpression') {
    console.log(node);
    throw new Error(`Invalid Object Assignment, expecting ObjectExpression, found "${node.type}" (${node.start},${node.end})`);
  }
  if (!lhs) {
    lhs = [];
  }
  let list = node.properties.map(node => readObjectPropertyAssignment(lhs, node, assignments, tokens, suggestions));
  return list;
}

function readObjectPropertyAssignment (lhs, node, assignments, tokens, suggestions) {
  if (node.type === 'SpreadElement') {
    if (node.argument.type === 'Identifier') {
      return []; // Todo: Can we reverse lookup assignment?
    } else {
      return readAssignment(lhs, node.argument, assignments, tokens, suggestions);
    }
  } else if (node.type == 'ObjectProperty') {
    lhs = readObjectKey(lhs, node.key, assignments, tokens);
    return lhs.concat(readAssignment(lhs, node.value, assignments, tokens, suggestions));
  } else if (node.type === 'ObjectMethod') {
    lhs = readObjectKey(lhs, node.key, assignments, tokens);
    return lhs;
  } else {
    console.log(node);
    throw new Error(`Invalid Object Assignment, expecting {ObjectProperty, ObjectMethod}, found "${node.type}" (${node.start},${node.end})`);
  }
}

function readObjectKey (lhs, node, assignments, tokens) {
  switch (node.type) {
    case 'Identifier':
      return [node.name];
      break;
    case 'StringLiteral':
      return [node.value];
      break;
  }
  return [];
}

function readMember (node, token) {
  if (!token) {
    token = {
      identifiers: [],
      calleeIndex: -1,
      arguments: null,
      position: {
        start: {
          line: node.loc.start.line,
          column: node.loc.start.column
        },
        end: {
          line: node.loc.end.line,
          column: node.loc.end.column
        }
      }
    };
  };
  if (node.type === 'Identifier') {
    token.identifiers.push(node.name);
  } else if (node.type === 'MemberExpression') {
    let name = '?';
    switch (node.property.type) {
      case 'Identifier':
        name = node.property.name;
        break;
      case 'StringLiteral':
        name = node.property.value;
        break;
    }
    token = readMember(node.object, token);
    token.identifiers.push(name);
  } else if (node.type === 'CallExpression') {
    token.identifiers.push(node.callee.name);
    token.calleeIndex = token.identifiers.length - 1;
    token.arguments = (node.arguments || []).map(argument => readArgument(argument));
  }
  return token;
};

function readMemberWithAssignments (lhs, node, assignments, tokens, suggestions) {
  let token = readMember(node);
  let names = token.identifiers;
  for (let i = 0; i < assignments.length; i++) {
    let found = false;
    let assignment = assignments[i];
    let lhs = assignment.left;
    let rhs = assignment.right;
    if (lhs.length <= names.length) {
      for (let len = lhs.length; len > 0; len--) {
        if (lhs.slice(0, len).join(':') === names.slice(0, len).join(':')) {
          names = rhs.concat(names.slice(len));
          token.identifiers = names;
          found = true;
          break;
        }
      }
    }
    if (found) {
      break;
    }
  }
  return token;
}

/**
* @param {object} AST The abstract syntax tree
* @returns {array} List of providers
*/
module.exports = (AST) => {

  let result = readBody(AST.program.body);
  let tokens = result.tokens;
  let suggestions = result.suggestions;

  let imports = tokens
    .filter(token => {
      return token.identifiers.length >= 1 &&
        token.identifiers[0] === 'require' &&
        token.calleeIndex === 0 &&
        token.arguments &&
        token.arguments[0];
    });

  let callList = tokens
    .filter(token => token.identifiers[0] === 'lib' && token.identifiers[1])
    .map(token => {
      token.identifiers = token.identifiers.slice(1).filter(t => !!t && typeof t === 'string').map(t => t.toLowerCase());
      return token;
    });

  let calls = callList
    .filter(token => {
      return token.identifiers[2] && token.identifiers[2][0] === '@'
        ? token.identifiers.length > 2
        : token.identifiers[1]
          ? token.identifiers.length > 1
          : false;
    });

  let providers = callList
    .map(token => token.identifiers[0])
    .reduce((names, name) => {
      return names.indexOf(name) === -1
        ? names.concat(name)
        : names;
    }, []);

  return {
    imports: imports,
    calls: calls,
    providers: providers,
    suggestions: suggestions
  };

};
