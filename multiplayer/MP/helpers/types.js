const mime = require('mime');

const TEXT_TYPES = {
  'application/json': true,
  'application/javascript': true,
  'application/xml': true,
  'application/octet-stream': true,
  'application/msword': true,
  'application/x-sql': true
};

module.exports = {
  getType: pathname => {
    return mime.getType(pathname);
  },
  isBinaryType: (type) => {
    type = (type || '').split(';')[0];
    return type &&
      !type.match(/^text\//i) &&
      !TEXT_TYPES[type];
  }
};
