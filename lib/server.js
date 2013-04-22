
var EventEmitter = require('events').EventEmitter;
var net = require('net');

var Client = require('./client.js');

var DataListener = require('./datalistener.js');

function FtpServer(opts) {
    EventEmitter.call(this);

    this.srv = net.createServer();
    this.ip = opts.ip || undefined;
    this.debug = opts.debug || 0;

    this.srv.on('listening', listening.bind(this));
    this.srv.on('connection', connection.bind(this));
    this.srv.on('error', this.emit.bind(this, 'error'));

    this.listenersPool = [];
    this.listenersQueue = [];
    this.listenersMinPort = opts.dataMin || 6000;
    this.listenersMaxPort = opts.dataMax || 6099;
}
module.exports = FtpServer;
var proto = FtpServer.prototype = Object.create(EventEmitter.prototype);

function listening() {
    this.logIf(0, "nodeFTPd server up and ready for connections");
}

function connection(socket) {
    this.emit('client:connected', new Client(socket, this));
}

proto.listen = function() {
    return this.srv.listen.apply(this.srv, arguments);
};

proto.requestListener = function(client, cb) {
    for(var i=0; i<this.listenersPool.length; i++) {
        if(this.listenersPool[i].free) {
            console.log('Use available listener');
            return this.listenersPool[i].reserve(client, cb);
        }
    }
    if(this.listenersMinPort <= this.listenersMaxPort) {
        console.log('Create new listener');
        var listener = new DataListener(this, this.listenersMinPort, this.ip);
        this.listenersMinPort++;
        listener.reserve(client, cb);
        this.listenersPool.push(listener);
    }
    else {
        console.log('Enqueue for listener');
        this.listenersQueue.push(cb);
    }
};

proto.releaseListener = function(listener) {
    //
};

proto.logIf = function(level, message, socket) {
    if (this.debug >= level) {
        var pre;
        if (socket) {
            pre = '['+socket.remoteAddress+':'+socket.remotePort+'] ';
        }
        else {
            pre = '[server] ';
        }
        console.log(pre+message.split('\n').join('\n'+pre));
    }
};