const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const uuid = require('uuid');
const async = require('async');
const tar = require('tar-stream');

const format = require('./format.js');

module.exports = {
  pack: async function (files, showProgress) {
    showProgress = !!showProgress;
    const progress = {log: function () { showProgress && console.log.apply(null, arguments); }};
    return new Promise((resolve, reject) => {
      !fs.existsSync('/tmp') && fs.mkdirSync('/tmp');
      !fs.existsSync('/tmp/packit') && fs.mkdirSync('/tmp/packit', 0o777);
      let tmpPath = `/tmp/packit/newpack.${uuid.v4()}.tar.gz`;
      let start = new Date().valueOf();
      let tarball = fs.createWriteStream(tmpPath, {mode: 0o777});
      let pack = tar.pack();
      let ignoreList = fs.existsSync('.libignore') ? fs.readFileSync('.libignore').toString() : '';
      ignoreList = ignoreList.split('\n').map(v => v.replace(/^\s(.*)\s$/, '$1')).filter(v => v);
      let packSize = 0;
      let totalSize = Object.keys(files).reduce((size, pathname) => {
        return size + files[pathname].byteLength;
      }, 0);
      // pipe the pack stream to your file
      pack.pipe(tarball);
      // Run everything in parallel...
      async.parallel(Object.keys(files).map((pathname) => {
        let buffer = files[pathname];
        return (callback) => {
          pack.entry({name: pathname}, buffer, () => {
            packSize += buffer.byteLength;
            progress.log(`Packing "${pathname}" (${((packSize / totalSize) * 100).toFixed(2)}%) ...`);
            callback();
          });
        };
      }), (err) => {
        if (err) {
          return reject(err);
        }
        pack.finalize();
      });
      tarball.on('close', () => {
        let buffer = fs.readFileSync(tmpPath);
        fs.unlinkSync(tmpPath);
        progress.log(`Package size: ${format.bytes(buffer.byteLength)}`);
        progress.log(`Compressing ...`);
        zlib.gzip(buffer, (err, result) => {
          if (err) {
            return reject(err);
          }
          let t = new Date().valueOf() - start;
          progress.log(`Compressed size: ${format.bytes(result.byteLength)}`);
          progress.log(`Compression: ${((result.byteLength / buffer.byteLength) * 100).toFixed(2)}%`);
          progress.log(`Pack complete, took ${t}ms!`);
          resolve(result);
        });
      });
    });
  }
};
