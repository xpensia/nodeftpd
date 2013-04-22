
var Server = require('./lib/server.js');
module.exports = Server;

Server.createServer = function() {
    var s = Object.create(Server.prototype);
    Server.apply(s, arguments);
    return s;
};
