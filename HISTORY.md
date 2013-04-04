# History

## 4 April 2013

Forked from https://github.com/alanszlosek/nodeftpd
Plan to use the code logic and rewrite it to be a base framework like Haraka is for SMTP

### Original note from Alan W Szlosek Jr

This is turning out to be quite a deviation from the original code. Figured that if there's a need for an ftp server written in node.js, one probably needs to tack on custom functionality, otherwise they'd just use vsftpd. So my goal is to lay the groundwork for a basic FTP server, with all the right hooks in place for customizing operations.

I assume you'll want to customize:

* User authentication (user and pass commands)
* Base folder for file operations
* What happens when certain file commands are performed

For my specific needs (at work) we needed custom user authentication, to sandbox all the file operations, and to run special code when a file is uploaded.

Thanks, Alan



## 17 April 2012

Added LICENSE.txt with MIT license. Original code base had none, my changes are a pretty big deviation, and people have been asking.

## 04 September 2011

Tested passive and non-passive data connections and found some issues, so I did some re-working.

Some things that might be nice:

* Figure out how it should be run, maybe as root first but execs to another user
* Fork new process when client connects and authenticates

## Old Readme Follows ...

### 28 March 2010

Forked from http://github.com/billywhizz/nodeftpd 
Andrew Johnston - http://blog.beardsoft.com/node-ftp-server-initial-release

Andrew's initial release was tested about node.js 0.1.21
In the few short months since that release, node.js has changed quite a bit
to where it is now, at time of writing 0.1.33

Changes made to nodeftp are as follows:

1. POSIX module has now been moved to FS (0.1.29)
2. File module has been removed (0.1.29)
3. sys.exec callback system seems to have changed??
   - as such quite a lot of moving about and rehacking had to take place:
   - LIST/NLIST
   - DEL
   - STOR
   - RETR
   - RNTO
4. tcp has changed function names and listeners
5. Rewrote ftptest.js as well
7. Changed ports to 7001/7002 so I can test without being root
8. Finally. Reformatted for my Emacs and javascript-mode

Also, not tested in Passive mode yet, but I think it works??

One thing I had problems with was the root filesystem of the FTP server.
Even though I was running the ftpd.js from /home/rob/workspace it changed
it to "/". This meant that if I tried to get the SIZE of a file, eg: 
/home/rob/workspace/file.txt
it tried to get the SIZE of
/home/rob/workspace//home/rob/workspace/file.txt
I narrowed this down to the dummyfs.js functionality, but then
if I changed the dummyfs root there was repeating of the path names

TODO
- Fix the repeating file paths problem
- Add in non-anonymous logins
- Implement non-implemented functionality (see ftpd.js TODO list)
- Add in proper error checking
- Test in passive mode

### 20 June 2010

Updated for node v0.1.98
