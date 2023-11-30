require('dotenv').config({silent: true});

const MultiplayerServer = require('./MP/Server.js');

const server = new MultiplayerServer();
server.listen(7331);
