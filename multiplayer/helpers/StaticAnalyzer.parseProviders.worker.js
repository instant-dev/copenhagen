const { parentPort } = require('worker_threads');
const parseProviders = require('./StaticAnalyzer.parseProviders.js');
parentPort.on('message', json => {
  if (json === 'ok') {
    parentPort.postMessage('ok');
  } else {
    let AST = JSON.parse(json);
    let parsed = parseProviders(AST);
    parentPort.postMessage(JSON.stringify(parsed));
  }
});
