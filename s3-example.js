
var path = require('path');

var ftpd = require('./index.js');
var knox = require('knox');

var server = ftpd.createServer({
    debug: 4,
    dataMin: 7002,
    dataMax: 7099,
    ip: '127.0.0.1'
});

var s3 = knox.createClient({
    key: process.env.S3_KEY
  , secret: process.env.S3_SECRET
  , bucket: process.env.S3_BUCKET
});

server.on('client:connected', function(client) {
    var cwd = '/';

    var user = null;
    var pass = null;

    client.on('command:user', function(username, cb) {
        pass = username;
        cb(null, true);
    });

    client.on('command:pass', function(password, cb) {
        cb(null, pass == password);
    });

    client.on('command:pwd', function(cb) {
        cb(null, cwd);
    });

    client.on('command:cwd', function(dir, cb) {
        if(!dir) {
            return cb(true);
        }
        if(dir[0] != '/') {
            dir = path.join(cwd, dir);
        }
        dir = path.resolve(dir);
        if(dir != '/') {
            s3.getFile(dir.slice(1)+'/', function(err, res) {
                if(err) {
                    cb(err);
                }
                else if(res.statusCode == 200) {
                    cwd = dir;
                    cb(null, cwd);
                }
                else {
                    cb(true);
                }
            });
        }
        else {
            cwd = '/';
            cb(null, cwd);
        }
    });

    client.on('command:list', function(cb) {
        var prefix = (cwd == '/') ? '':cwd.slice(1)+'/';
        s3.list({prefix:prefix, delimiter: '/'}, function(err, res) {
            if(err) {
                return cb(err, null);
            }
            var i;
            var files = [];
            var date = new Date();
            if(res.CommonPrefixes) {
                for(i=0; i<res.CommonPrefixes.length; i++) {
                    files.push({
                        name: res.CommonPrefixes[i].Prefix.slice(prefix.length, -1),
                        size: 0,
                        directory: true,
                        date: date,
                        mode: 0777
                    });
                }
            }
            if(res.Contents) {
                for(i=0; i<res.Contents.length; i++) {
                    if(res.Contents[i].Key != prefix) {
                        files.push({
                            name: res.Contents[i].Key.slice(prefix.length),
                            size: res.Contents[i].Size,
                            file: true,
                            date: res.Contents[i].LastModified,
                            mode: 0777
                        });
                    }
                }
            }
            cb(null, files);
        });
    });

    client.on('command:retr', function(name, cb) {
        var p = path.join(cwd, name);
        s3.getFile(p.slice(1), function(err, res) {
            if(err) {
                return cb(err, null);
            }
            res.pause();
            cb(null, res);
        });
    });
});

server.listen(7001);
