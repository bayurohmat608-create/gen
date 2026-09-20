from __future__ import annotations
import json, os, queue, threading, time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
import blindroom

ROOT=Path(__file__).resolve().parent
CONFIG_PATH=Path(os.environ.get('BLINDROOM_CONFIG', str(Path.cwd()/'blindroom.json'))).expanduser()
VERSION='0.3.0'
ROOM_MODES={
 'free':'Let the conversation evolve naturally while staying relevant to the topic.',
 'debate':'Disagree constructively when useful. Test claims, surface trade-offs, and avoid fake consensus.',
 'brainstorm':'Generate, combine, and refine ideas collaboratively. Prefer breadth first, then converge.',
 'review':'Review critically. Identify risks, gaps, edge cases, and practical improvements.'}

class Runtime:
 def __init__(self):
  self.lock=threading.RLock(); self.running=False; self.paused=False; self.stop_requested=False
  self.topic=''; self.mode='free'; self.turn_limit=8; self.next_agent_index=0; self.started_at=None
  self.messages=[]; self.subscribers=[]; self.last_error=None; self.demo=False
 def snapshot(self):
  with self.lock:
   return {'version':VERSION,'running':self.running,'paused':self.paused,'topic':self.topic,'mode':self.mode,
    'turn_limit':self.turn_limit,'turn_count':sum(1 for m in self.messages if m.get('role')=='agent'),
    'started_at':self.started_at,'messages':list(self.messages[-250:]),'last_error':self.last_error,
    'config':config_summary(),'demo':self.demo}
 def publish(self,event,data):
  packet={'event':event,'data':data,'ts':datetime.now(timezone.utc).isoformat()}; dead=[]
  for q in list(self.subscribers):
   try:q.put_nowait(packet)
   except queue.Full:dead.append(q)
  for q in dead:
   try:self.subscribers.remove(q)
   except ValueError:pass
 def add(self,role,speaker,text,meta=None):
  with self.lock:
   msg={'id':f'm-{int(time.time()*1000)}-{len(self.messages)+1}','role':role,'speaker':speaker,'text':text,
    'created_at':datetime.now(timezone.utc).isoformat(),'meta':meta or {}}
   self.messages.append(msg)
  self.publish('message',msg); return msg
RUNTIME=Runtime()

def config_summary():
 if not CONFIG_PATH.exists():return {'exists':False,'agents':[]}
 try:
  cfg=blindroom.load_config(CONFIG_PATH)
  return {'exists':True,'room':{'name':cfg.name,'turns':cfg.turns,'reveal_at_end':cfg.reveal_at_end},'agents':[
   {'name':a.name,'provider':a.provider,'model':a.model,'persona':a.persona,'api_key_env':a.api_key_env,
    'base_url':a.base_url,'max_output_tokens':a.max_output_tokens,'key_present':bool(os.getenv(a.api_key_env))} for a in cfg.agents]}
 except Exception as e:return {'exists':True,'error':str(e),'agents':[]}

def load_config():
 if not CONFIG_PATH.exists():raise ValueError('blindroom.json belum ada. Buka Settings atau jalankan: blindroom init')
 return blindroom.load_config(CONFIG_PATH)

def save_config(p):
 agents=p.get('agents'); allowed={'openai','anthropic','gemini','openai-compatible'}
 if not isinstance(agents,list) or len(agents)!=2:raise ValueError('Exactly two agents are required')
 clean=[]
 for i,a in enumerate(agents):
  provider=str(a.get('provider','')).strip().lower(); persona=str(a.get('persona','default')).strip().lower(); model=str(a.get('model','')).strip(); env=str(a.get('api_key_env','')).strip()
  if provider not in allowed:raise ValueError(f'Unsupported provider for Agent {i+1}')
  if persona not in blindroom.PERSONAS:raise ValueError(f'Unknown persona: {persona}')
  if not model:raise ValueError(f'Model is required for Agent {i+1}')
  if not env or not env.replace('_','A').isalnum():raise ValueError('Invalid API key environment variable name')
  item={'name':'Agent A' if i==0 else 'Agent B','provider':provider,'model':model,'persona':persona,'api_key_env':env,
   'max_output_tokens':max(64,min(int(a.get('max_output_tokens',700)),16000))}
  base=str(a.get('base_url') or '').strip()
  if provider=='openai-compatible':
   if not base.startswith(('https://','http://127.0.0.1','http://localhost')):raise ValueError('OpenAI-compatible base_url must use HTTPS or localhost')
   item['base_url']=base
  clean.append(item)
 data={'room':{'name':'Blind Agent Room','turns':max(1,min(int(p.get('turns',8)),50)),'reveal_at_end':bool(p.get('reveal_at_end',True))},'agents':clean}
 CONFIG_PATH.write_text(json.dumps(data,indent=2,ensure_ascii=False),encoding='utf-8')

def prompt(topic,transcript,speaker,other,mode):
 return blindroom.build_prompt(topic,transcript,speaker,other)+f'\n\nROOM MODE:\n{ROOM_MODES.get(mode,ROOM_MODES["free"])}'

def demo_reply(agent,other,topic,n):
 banks={
 'mbul':[f"Waduh bos 😭 topik '{topic}' ternyata bisa melebar juga. {other.name}, bagian paling kontroversialnya yang mana?",'Oke, gue tangkep poinmu. Tapi jangan keburu jadi sidang skripsi 😭 Coba uji asumsi utamanya dulu.','Nah ini seru. Gue setuju sebagian, tapi kalau kondisi nyatanya beda dari asumsi awal gimana?'],
 'focus':[f"Mari definisikan '{topic}' menjadi tujuan, kendala, dan kriteria keberhasilan sebelum memilih solusi.",'Ada dua asumsi yang perlu diuji. Mana constraint wajib, dan apakah kompleksitasnya sepadan?','Jangan simpulkan dulu. Ambil satu contoh konkret lalu bandingkan trade-off yang sama.'],
 'calm':[f"Menarik. Untuk '{topic}', kita bisa mulai dari bagian yang paling jelas lalu masuk ke perbedaannya.",'Saya memahami arah argumennya. Ada alternatif yang layak dipertimbangkan tanpa harus menolak poin tadi.','Kita mendekati inti masalah. Mari rangkum yang disepakati sebelum lanjut.'],
 'default':[f"Topik '{topic}' menarik. Hasil seperti apa yang sebenarnya ingin kita capai?",'Poin itu masuk akal. Saya ingin menguji satu alternatif agar kita tidak terlalu cepat mengunci kesimpulan.','Kita punya beberapa arah. Mari pilih satu yang paling konkret.']}
 b=banks.get(agent.persona,banks['default']); return b[n%len(b)]

def worker():
 try:
  with RUNTIME.lock: topic=RUNTIME.topic; mode=RUNTIME.mode; limit=RUNTIME.turn_limit; demo=RUNTIME.demo
  if demo:
   try:cfg=load_config()
   except Exception:
    cfg=blindroom.RoomConfig('Blind Agent Room',limit,True,[
     blindroom.Agent('Agent A','openai','demo-focus','focus','OPENAI_API_KEY'),
     blindroom.Agent('Agent B','gemini','demo-mbul','mbul','GEMINI_API_KEY')])
  else:cfg=load_config()
  while True:
   with RUNTIME.lock:
    if RUNTIME.stop_requested:break
    paused=RUNTIME.paused; idx=RUNTIME.next_agent_index; current=list(RUNTIME.messages)
   count=sum(1 for m in current if m.get('role')=='agent')
   if count>=limit:break
   if paused:time.sleep(.15);continue
   transcript=[blindroom.Turn(i+1,m['speaker'],m['text'],m['created_at']) for i,m in enumerate(current) if m.get('role') in {'agent','user'}]
   speaker=cfg.agents[idx]; other=cfg.agents[(idx+1)%2]; RUNTIME.publish('typing',{'speaker':speaker.name,'active':True})
   try:
    if demo:time.sleep(.7); text=demo_reply(speaker,other,topic,count)
    else:text=blindroom.call_provider(speaker,blindroom.build_system(speaker),prompt(topic,transcript,speaker,other,mode)).strip()
   finally:RUNTIME.publish('typing',{'speaker':speaker.name,'active':False})
   RUNTIME.add('agent',speaker.name,text,{'provider':speaker.provider,'model':speaker.model,'persona':speaker.persona,'agent_index':idx})
   with RUNTIME.lock:RUNTIME.next_agent_index=(idx+1)%2
   if text.rstrip().endswith('[END]'):break
   time.sleep(.16)
 except Exception as e:
  with RUNTIME.lock:RUNTIME.last_error=str(e)
  RUNTIME.publish('error',{'message':str(e)})
 finally:
  with RUNTIME.lock:RUNTIME.running=False; RUNTIME.paused=False; RUNTIME.stop_requested=False
  RUNTIME.publish('state',RUNTIME.snapshot())

def start(p):
 topic=str(p.get('topic') or '').strip(); mode=str(p.get('mode') or 'free').strip().lower(); turns=max(1,min(int(p.get('turns',8)),50)); demo=bool(p.get('demo',False))
 if not topic:raise ValueError('Topik tidak boleh kosong')
 if mode not in ROOM_MODES:raise ValueError('Unknown room mode')
 if not demo:
  for a in load_config().agents:
   if not os.getenv(a.api_key_env):raise ValueError(f'API key belum tersedia: {a.api_key_env}')
 with RUNTIME.lock:
  if RUNTIME.running:raise ValueError('Room masih berjalan')
  RUNTIME.running=True;RUNTIME.paused=False;RUNTIME.stop_requested=False;RUNTIME.topic=topic;RUNTIME.mode=mode;RUNTIME.turn_limit=turns;RUNTIME.next_agent_index=0;RUNTIME.started_at=datetime.now(timezone.utc).isoformat();RUNTIME.messages=[];RUNTIME.last_error=None;RUNTIME.demo=demo
 threading.Thread(target=worker,daemon=True).start(); RUNTIME.publish('state',RUNTIME.snapshot())

def export_data():
 s=RUNTIME.snapshot(); return {'format':'blind-agent-room-web-transcript-v1','exported_at':datetime.now(timezone.utc).isoformat(),'topic':s['topic'],'mode':s['mode'],'messages':s['messages'],'config':s['config']}
