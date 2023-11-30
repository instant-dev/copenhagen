const os = require('os')
const { Worker } = require('worker_threads');
const path = require('path');
const PARSE_TIME_LIMIT = 100;
const MAX_MESSAGE_LENGTH = 10 * 1024 * 1024;

function bootWorker () {
  return new Worker(path.join(__dirname, './StaticAnalyzer.parseProviders.worker.js'));
}

let worker = bootWorker();
let processing = false;

async function parse (json) {
  let serializedAST = JSON.stringify(json);
  if (serializedAST.length > MAX_MESSAGE_LENGTH) {
    throw new Error('Max AST size exceeded.');
  }
  processing = true;
  let result;
  try {
    result = await new Promise((resolve, reject) => {
      worker.once('message', () => {
        let timeout = setTimeout(() => {
          worker.terminate(); //
          reject(new Error(`Parse failed: time limit of ${PARSE_TIME_LIMIT}ms exceeded.`));
        }, PARSE_TIME_LIMIT);
        worker.once('message', result => {
          clearTimeout(timeout);
          resolve(JSON.parse(result));
        });
        // Worker serialization is very inefficient as of Node 16
        // Using JSON.stringify/parse to serialize avoids crashes
        worker.postMessage(serializedAST);
      });
      worker.postMessage('ok');
    });
  } catch (e) {
    worker = null;
    processing = false;
    throw e;
  }
  processing = false;
  return result;
}

module.exports = async function parseProvidersAsync (AST) {
  while (processing) {
    await new Promise(resolve => setTimeout(resolve, 1));
  }
  worker = worker || bootWorker();
  let parsed = await parse(AST);
  return parsed;
};
