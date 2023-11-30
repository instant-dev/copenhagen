function formatNumber (n) {
  var negative = false;
  if (parseInt(n) < 0) {
    n = n.toString().substr(1);
    negative = true;
  }
  var str = n.toString().split('.')[0];
  var dec = n.toString().split('.')[1];
  var fmt = '';
  while (str.length > 3) {
    fmt = ',' + str.substr(str.length - 3) + fmt;
    str = str.substr(0, str.length - 3);
  }
  return (negative ? '-' : '') + str + fmt + (dec ? '.' + dec : '');
}

function formatBytes (n) {
  var prefixes = ['', 'k', 'M', 'G', 'T'];
  while (n >= 2048 && prefixes.length > 1) {
    prefixes.shift();
    n = n / 1024;
  }
  var ns = n.toFixed(2);
  if (ns.split('.')[1] === '00') {
    ns = Math.round(n);
  }
  return [formatNumber(ns), 'B'].join(' ' + prefixes[0]);
}

module.exports = {
  number: formatNumber,
  bytes: formatBytes
};
