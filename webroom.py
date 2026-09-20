#!/usr/bin/env python3
import argparse
from http.server import ThreadingHTTPServer
from roomcore import VERSION
from webhandler import Handler
def main():
 p=argparse.ArgumentParser(description='Blind Agent Room local web chatroom');p.add_argument('--host',default='127.0.0.1');p.add_argument('--port',type=int,default=8765);p.add_argument('--quiet',action='store_true');a=p.parse_args()
 if a.host not in {'127.0.0.1','localhost','::1'}:print('WARNING: non-localhost binding can expose API keys/session data to your network.')
 s=ThreadingHTTPServer((a.host,a.port),Handler);s.quiet=a.quiet;print(f'Blind Agent Room Web v{VERSION}\nOpen: http://{a.host}:{a.port}\nCtrl+C to stop. UI API keys are memory-only.')
 try:s.serve_forever()
 except KeyboardInterrupt:print('\nStopped.')
 finally:s.server_close()
if __name__=='__main__':main()
