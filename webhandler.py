from __future__ import annotations
import json,mimetypes,os,queue,urllib.parse
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from roomcore import RUNTIME,config_summary,export_data,save_config,start
ROOT=Path(__file__).resolve().parent; WEB_ROOT=ROOT/'web'
def reply(h,status,payload):
 data=json.dumps(payload,ensure_ascii=False).encode();h.send_response(status);h.send_header('Content-Type','application/json; charset=utf-8');h.send_header('Content-Length',str(len(data)));h.send_header('Cache-Control','no-store');h.end_headers();h.wfile.write(data)
def body(h):
 n=int(h.headers.get('Content-Length','0') or '0')
 if n>1_000_000:raise ValueError('Request too large')
 x=json.loads((h.rfile.read(n) if n else b'{}').decode())
 if not isinstance(x,dict):raise ValueError('JSON body must be an object')
 return x
class Handler(BaseHTTPRequestHandler):
 server_version='BlindRoom/0.2.0'
 def log_message(self,fmt,*args):
  if not getattr(self.server,'quiet',False):super().log_message(fmt,*args)
 def end_headers(self):
  self.send_header('X-Content-Type-Options','nosniff');self.send_header('X-Frame-Options','DENY');self.send_header('Referrer-Policy','no-referrer');self.send_header('Content-Security-Policy',"default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'");super().end_headers()
 def do_GET(self):
  path=urllib.parse.urlparse(self.path).path
  if path=='/api/state':return reply(self,200,RUNTIME.snapshot())
  if path=='/api/events':return self.events()
  if path=='/api/export':return reply(self,200,export_data())
  if path.startswith('/api/'):return reply(self,404,{'error':'Not found'})
  self.static(path)
 def do_POST(self):
  try:
   p=body(self); path=urllib.parse.urlparse(self.path).path
   if path=='/api/start':start(p);return reply(self,200,{'ok':True,'state':RUNTIME.snapshot()})
   if path=='/api/stop':
    with RUNTIME.lock:RUNTIME.stop_requested=True;RUNTIME.paused=False
    RUNTIME.publish('state',RUNTIME.snapshot());return reply(self,200,{'ok':True})
   if path=='/api/pause':
    with RUNTIME.lock:RUNTIME.paused=bool(p.get('paused',True))
    RUNTIME.publish('state',RUNTIME.snapshot());return reply(self,200,{'ok':True,'paused':RUNTIME.paused})
   if path=='/api/message':
    text=str(p.get('text') or '').strip()
    if not text:raise ValueError('Pesan kosong')
    RUNTIME.add('user','You',text,{});return reply(self,200,{'ok':True})
   if path=='/api/config':
    with RUNTIME.lock:
     if RUNTIME.running:raise ValueError('Stop room sebelum mengubah config')
    save_config(p);RUNTIME.publish('state',RUNTIME.snapshot());return reply(self,200,{'ok':True,'config':config_summary()})
   if path=='/api/key':
    env=str(p.get('env') or '').strip();value=str(p.get('value') or '')
    if not env or not env.replace('_','A').isalnum():raise ValueError('Invalid env name')
    if not value:raise ValueError('API key kosong')
    os.environ[env]=value;RUNTIME.publish('state',RUNTIME.snapshot());return reply(self,200,{'ok':True,'env':env,'stored':'memory-only'})
   return reply(self,404,{'error':'Not found'})
  except Exception as e:return reply(self,400,{'error':str(e)})
 def events(self):
  q=queue.Queue(maxsize=128);RUNTIME.subscribers.append(q);self.send_response(200);self.send_header('Content-Type','text/event-stream');self.send_header('Cache-Control','no-cache');self.send_header('Connection','keep-alive');self.end_headers()
  try:
   self.wfile.write(f"data: {json.dumps({'event':'state','data':RUNTIME.snapshot()},ensure_ascii=False)}\n\n".encode());self.wfile.flush()
   while True:
    try:line=f"data: {json.dumps(q.get(timeout=15),ensure_ascii=False)}\n\n"
    except queue.Empty:line=': ping\n\n'
    self.wfile.write(line.encode());self.wfile.flush()
  except (BrokenPipeError,ConnectionResetError):pass
  finally:
   try:RUNTIME.subscribers.remove(q)
   except ValueError:pass
 def static(self,path):
  if path=='/':path='/index.html'
  rel=Path(urllib.parse.unquote(path.lstrip('/')))
  if '..' in rel.parts:return self.send_error(404)
  target=(WEB_ROOT/rel).resolve();root=WEB_ROOT.resolve()
  if root not in target.parents and target!=root:return self.send_error(404)
  if not target.is_file():return self.send_error(404)
  data=target.read_bytes();mime=mimetypes.guess_type(target.name)[0] or 'application/octet-stream';self.send_response(200);self.send_header('Content-Type',mime+('; charset=utf-8' if mime.startswith(('text/','application/javascript','application/json')) else ''));self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-cache');self.end_headers();self.wfile.write(data)
