# base framework for building FTP server

The original README of this project has been moved to HISTORY.md

## TODO

* Implement Full RFC 959
* Implement RFC 2428
* Implement RFC 2228
* Implement RFC 3659
* Implement TLS - http://en.wikipedia.org/wiki/FTPS
* Fire more events to allow customizations: directory changes, file uploads, etc

## known to work (or mostly work)

* Passive data connection establishment
* Non-passive data connection establishment
* CWD/CDUP - change working directory
* LIST - list files
* RETR - download

If a command is not listed, I probably haven't tested it yet.

## Notes

Don't run node as root just so you can get access to the FTP port. We run our node FTP server as an unprivileged user and perform port-forwarding with iptables. The following should work for you as well:

> iptables -A PREROUTING -t nat -i eth0 -p tcp --dport 21 -j REDIRECT --to-port 10000