# node-olsa

As at 09 Jan 2091 the node "soap" package is using a fork from https://github.com/martinholden-skillsoft/node-soap as a fix was needed to the WS-Security PasswordDigest https://github.com/vpulim/node-soap/pull/1039

To run:

Set Environment variables (example below for Windows)

set endpoint=aeeval8.skillwsa.com
set customerid=THISISSECRET
set sharedsecret=THSISSECRET
set customer=default

node app
