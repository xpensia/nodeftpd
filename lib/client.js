
var EventEmitter = require('events').EventEmitter;
var net = require('net');

var async = require('async');

function FtpRemoteClient(socket, server) {
    EventEmitter.call(this);

    this.server = server;
    this.socket = socket;
    socket.setTimeout(0); // We want to handle timeouts ourselves
    socket.setEncoding("ascii"); // force data String not Buffer, so can parse FTP commands as a string
    socket.setNoDelay();

    this.buffer = '';

    this.passive = false;
    this.dataHost = null;
    this.dataPort = 20; // default
    this.dataListener = null; // for incoming passive connections

    this.dataSocket = []; // the actual data socket
    this.dataCallback = [];

    this.mode = "ascii";
    // Authentication
    this.authFailures = 0; // 3 tries then we disconnect you
    this.auth = false;

    this.notes = {};

    var client = this;
    socket.on('connect', connect.bind(this));
    socket.on('data', data.bind(this));
}
module.exports = FtpRemoteClient;
var proto = FtpRemoteClient.prototype = Object.create(EventEmitter.prototype);

proto.logIf = function(lvl, msg) {
    this.server.logIf(lvl, msg, this.socket);
};

function connect() {
    this.logIf(1, 'Connection');
    this.socket.write('220 FTP server ('+
        (this.server.name || 'nodeftpd')+') ready\r\n');
}

function data(data) {
    var lines = (this.buffer + data).split('\n');
    if(lines.length <= 1) {
        // all commands finish with '\r\n', so lines should alway be length > 1
        return;
    }
    data = lines.shift().trim();
    this.buffer = lines.join('\n');

    this.logIf(2, "FTP command: " + data);

    var command, commandArg;
    var index = data.indexOf(" ");
    if (index > 0) {
        command = data.substring(0, index).trim().toUpperCase();
        commandArg = data.substring(index+1, data.length).trim();
    } else {
        command = data.trim().toUpperCase();
        commandArg = '';
    }

    var client = this;
    switch(command) {
        case 'USER':
            this.emit('command:user', commandArg, function(err, success) {
                if(err) {
                    client.logIf(0, err+'\n'+err.stack);
                }
                else if(success) {
                    client.notes.username = commandArg;
                    client.socket.write("331 Password required for " + commandArg + "\r\n");
                }
                else {
                    client.socket.write("530 Invalid username: " + commandArg + "\r\n");
                }
            });
            break;
        case 'PASS':
            this.emit('command:pass', commandArg, function(err, success) {
                if(err) {
                    client.logIf(0, err+'\n'+err.stack);
                    client.socket.write('451 Error processing request\r\n');
                }
                else if(success) {
                    client.socket.write("230 Logged on\r\n");
                    client.auth = true;
                }
                else {
                    client.socket.write("530 Invalid password\r\n");
                }
            });
            break;
        case 'PWD':
        case 'XPWD':
            if (!this.auth) {
                this.socket.write('530 Not logged in\r\n');
                break;
            }
            this.emit('command:pwd', function(err, cwd) {
                if(err) {
                    client.logIf(0, err+'\n'+err.stack);
                    client.socket.write('451 Error processing request\r\n');
                }
                else {
                    client.socket.write('257 "' + cwd + '" is current directory\r\n');
                }
            });
            break;
        case 'CDUP':
            commandArg = '..';
        case 'CWD':
            if (!this.auth) {
                this.socket.write('530 Not logged in\r\n');
                break;
            }
            this.emit('command:cwd', commandArg, function(err, cwd) {
                if(err) {
                    client.socket.write("550 Folder not found.\r\n");
                }
                else {
                    client.socket.write('250 CWD successful. "'+ cwd +'" is current directory\r\n');
                }
            });
            break;
        case 'TYPE':
            // Sets the transfer mode (ASCII/Binary).
            if (!this.auth) {
                this.socket.write('530 Not logged in\r\n');
                break;
            }
            if(commandArg == "A"){
                this.mode = "ascii";
                this.socket.write("200 Type set to A\r\n");
            }
            else{
                this.mode = "binary";
                this.socket.write("200 Type set to I\r\n");
            }
            break;
        case 'SYST':
            this.socket.write('215 UNIX emulated by NodeFTPd\r\n');
            break;
        // Get the feature list implemented by the server. (RFC 2389)
        case 'FEAT':
            if(!this.auth) {
                this.socket.write('530 Not logged in\r\n');
                break;
            }
            this.socket.write('211-Features\r\n');
            this.socket.write(' SIZE\r\n');
            this.socket.write('211 end\r\n');
            break;
        case 'PASV': // 500, 501, 502, 421, 530
            if(!this.auth) {
                this.socket.write('530 Not logged in\r\n');
                break;
            }
            function onListener(err, listener) {
                if(err) {
                    client.logIf(1, err.toString()+'\n'+err.stack);
                    client.socket.write('502 unknown error');
                    return;
                }
                client.dataListener = listener;
                listener.on('ready', onDataSocket.bind(client));

                var port = listener.getPort();
                client.logIf(3, "Passive data connection listening on port " + port);
                var ip = listener.getAdress();
                var i1 = parseInt(port / 256);
                var i2 = parseInt(port % 256);
                client.socket.write("227 Entering Passive Mode (" + ip.split(".").join(",") + "," + i1 + "," + i2 + ")\r\n");
                client.passive = true;
                client.socket.resume();
            }
            // 
            if (this.dataListener && this.dataListener.stale) {
                this.dataListener.release();
                this.dataListener = null;
            }
            // Pause processing of further commands
            this.socket.pause();
            if(this.dataListener) {
                // we're reusing a listener, should probably release it as soon as we get a datasocket
                this.dataListener.reset();
                onListener(null, this.dataListener);
            }
            else {
                this.server.requestListener(this, onListener);
            }
            this.logIf(3, "Passive data connection beginning to listen");
            break;
        case 'LIST':
            if(!this.auth) {
                this.socket.write('530 Not logged in\r\n');
                break;
            }
            async.parallel({
                list: this.emit.bind(this, 'command:list'),
                socket: whenDataReady.bind(this)
            }, function(err, results) {
                var socket = results.socket;
                var files = results.list;
                if(err) {
                    if(socket && socket.writable) {
                        socket.end();
                        client.socket.write("450 Requested file action not taken.\r\n");
                    }
                    else {
                        client.socket.write("425 Can't open data connection.\r\n");
                    }
                    client.logIf(0, "While sending file list, reading directory: " + err + '\n'+err.stack);
                    return;
                }
                var out = '';
                for(var i=0; i<files.length; i++) {
                    var s = files[i];
                    var size = s.size.toString();
                    var date = s.date.getUTCDate()+'.'+(s.date.getUTCMonth()+1)+'.'+s.date.getUTCFullYear();
                    if(i > 0) {
                        out += '\r\n';
                    }
                    out += (s.directory) ? 'd':'-';
                    out += (0400 & s.mode) ? 'r' : '-';
                    out += (0200 & s.mode) ? 'w' : '-';
                    out += (0100 & s.mode) ? 'x' : '-';
                    out += (040 & s.mode) ? 'r' : '-';
                    out += (020 & s.mode) ? 'w' : '-';
                    out += (010 & s.mode) ? 'x' : '-';
                    out += (04 & s.mode) ? 'r' : '-';
                    out += (02 & s.mode) ? 'w' : '-';
                    out += (01 & s.mode) ? 'x' : '-';
                    out += '  1  ftp  ftp  ';
                    out += size+'  ';
                    out += date+'  ';
                    out += s.name;
                }
                client.socket.write('125 Send file listing\r\n', function() {
                    socket.write(out);
                    console.log(out+'\r\n');
                    socket.write('\r\n', function() {
                        client.socket.write('226 Transfer OK\r\n');
                        socket.end();
                    });
                });
            });
            break;
        case 'RETR':
            if(!this.auth) {
                this.socket.write('530 Not logged in\r\n');
                break;
            }
            async.parallel({
                stream: this.emit.bind(this, 'command:retr', commandArg),
                socket: whenDataReady.bind(this)
            }, function(err, results) {
                var socket = results.socket;
                var stream = results.stream;
                if(err) {
                    if(socket && socket.writable) {
                        socket.end();
                        client.socket.write("450 Requested file action not taken.\r\n");
                    }
                    else {
                        client.socket.write("425 Can't open data connection.\r\n");
                    }
                    return;
                }
                client.logIf(3, "DATA file " + commandArg + " opened");
                client.socket.write("150 Opening " + client.mode.toUpperCase() + " mode data connection\r\n");
                stream.on('end', function() {
                    client.logIf(3, "DATA file " + commandArg + " closed");
                    client.socket.write("226 Closing data connection\r\n");
                });
                stream.resume();
                stream.pipe(socket);
            });
            break;
        default:
            this.socket.write("202 Not supported\r\n");
            break;
    }
}

function end() {
    this.logIf(1, 'Client connection ended', this.socket);
}

function error(err) {
    this.logIf(0, 'Client connection error: ' + err+'\n'+err.stack, this.socket);
    this.emit('error', err);
}

function onDataSocket(socket) {
    if(this.dataCallback.length) {
        var cb = this.dataCallback.shift();
        cb(null, socket);
    }
    else {
        this.dataSocket.push(socket);
    }
}

function whenDataReady(callback) {
    if (this.passive) {
        // how many data connections are allowed?
        // should still be listening since we created a server, right?
        if (this.dataSocket.length) {
            this.logIf(3, "A data connection exists");
            callback(null, this.dataSocket.shift());
        } else {
            this.logIf(3, "Passive, but no data socket exists ... waiting");
            this.dataCallback.push(callback);
        }
    } else {
        // Do we need to open the data connection?
        if (this.dataSocket.length) { // There really shouldn't be an existing connection
            this.logIf(3, "Using existing non-passive dataSocket");
            callback(null, this.dataSocket.shift());
        } else {
            var client = this;
            this.logIf(1, "Opening data connection to " + this.dataHost + ":" + this.dataPort);
            var dataSocket = new net.Socket();
            var open = false;
            // Since data may arrive once the connection is made, pause it right away
            dataSocket.on("data", function(data) {
                client.logIf(3, dataSocket.remoteAddress + ' event: data ; ' + (Buffer.isBuffer(data) ? 'buffer' : 'string'));
            });
            dataSocket.on("connect", function() {
                dataSocket.pause(); // Pause until the data listeners are in place
                //socket.dataSocket = dataSocket;
                open = true;
                client.logIf(3, "Data connection succeeded");
                callback(null, dataSocket);
            });
            dataSocket.on("close", function(had_error) {
                if (had_error) {
                    client.logIf(0, "Data event: close due to error");
                }
                else {
                    client.logIf(3, "Data event: close");
                }
            });
            dataSocket.on("end", function() {
                client.logIf(3, "Data event: end");
            });
            dataSocket.on("error", function(err) {
                client.logIf(0, "Data event: error: " + err);
                dataSocket.destroy();
                if(!open) {
                    callback(err, null);
                }
            });
            dataSocket.connect(this.dataPort, this.dataHost);
        }
    }
};
