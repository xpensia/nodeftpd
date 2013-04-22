
var EventEmitter = require('events').EventEmitter;
var net = require('net');

function DataListener(server, port, publicIP) {
    EventEmitter.call(this);

    this.server = server;
    this.publicIP = publicIP || null;
    this.ipAdress = this.publicIP;
    this.port = port;
    this.listening = false;
    this.free = true;
    this.stale = false;
    this.client = null;
    this.cb = null;

    this.socket = null;
}
module.exports = DataListener;
var proto = DataListener.prototype = Object.create(EventEmitter.prototype);

proto.reset = function() {
    this.removeAllListeners('ready');
};

proto.release = function() {
    this.removeAllListeners();
    this.free = true;
    this.server.releaseListener(this);
};

proto.reserve = function(client, cb) {
    this.free = false;
    if(this.listening) {
        console.log('Already listening');
        cb(null, this);
    }
    else if(!this.socket) {
        console.log('Prepare listening');
        this.socket = initialize.call(this);
    }
    this.client = client;
    this.cb = cb;
};

proto.getPort = function() {
    return this.port;
};

proto.getAdress = function() {
    return this.ipAdress;
};

function initialize() {
    this.client = null;
    this.cb = null;
    if(this.socket) {
        // ensure garbage collection
        if(this.socket._handle) {
            this.socket.close();
        }
        this.socket.removeAllListeners();
        this.socket = null;
    }
    var s = net.createServer();
    s.on('connection', onConnection.bind(this));
    s.on('listening', onListening.bind(this));
    s.on('error', this.emit.bind(this, 'error'));
    s.on('close', onClose.bind(this));

    s.listen(this.port);
    return s;
}

function onListening() {
    console.log('is finaly listening!');
    console.log(this);
    var addr = this.socket.address();
    this.ipAdress = this.publicIP || addr.address;
    this.listening = true;
    if(typeof this.cb == 'function') {
        this.cb(null, this);
    }
    else {
        console.log('No damn callback');
    } 
}

function onConnection(psocket) {
    var client = this.client;
    var dataListener = this;
    client.logIf(1, "Incoming passive data connection");

    psocket.on('data', function() {
        client.logIf(4, 'Data event: received ' + (Buffer.isBuffer(data) ? 'buffer' : 'string'));
    });

    psocket.on('end', function() {
        client.logIf(3, "Passive data event: end");
    });

    psocket.on('close', function(had_error) {
        client.logIf(
            (had_error ? 0 : 3),
            "Passive data event: close " + (had_error ? " due to error" : "")
        );
    });

    psocket.on('connect', function() {
        client.logIf(1, "Passive data event: connect");
        // Emit this so the pending callback gets picked up in whenDataWritable()
        dataListener.emit('ready', psocket);
    });
}

function onClose() {
    //
}

