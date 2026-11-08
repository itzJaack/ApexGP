#!/usr/bin/env python3
"""ApexGP LAN. Python 3.10+, standard library only; no cloud service."""
import argparse,base64,hashlib,ipaddress,json,math,mimetypes,secrets,socket,struct,sys,threading,time,webbrowser
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse,unquote
ROOT=Path(__file__).resolve().parent
START_LIGHT_SECONDS=3.6
RED_STOP_HOLD_SECONDS=1.25

def red_braking_seconds(speed,weather):
 return max(3,min(30,math.ceil(max(0,min(110,speed))*1.5/(5.5 if weather=='rain' else 7.5))))

def make_flag_zone(progress,blocked,length):
 step=length/math.ceil(length/180);centre=progress%length;post=math.floor(centre/step)
 return {'id':post,'progress':centre,'start':((post-1)*step)%length,'end':((post+1)*step)%length,'flag':'doubleyellow' if blocked else 'yellow','remaining':12}

def zone_contains(zone,progress,length):
 point=progress%length;start=zone['start']%length;end=zone['end']%length
 return start<=point<end if start<=end else point>=start or point<end

def finite(v,default=0):
 try:
  v=float(v);return v if math.isfinite(v) else default
 except (TypeError,ValueError):return default

def valid_steward_ledger(ledger,ids):
 if not isinstance(ledger,dict) or not isinstance(ledger.get('revision'),int) or ledger['revision']<0 or not isinstance(ledger.get('nextId'),int) or ledger['nextId']<1:return False
 riders=ledger.get('riders');plans=ledger.get('botPlans')
 if not isinstance(riders,list) or len(riders)>20 or not isinstance(plans,list) or len(plans)>200:return False
 seen=set();types={'warning','giveBack','longlap','doubleLonglap','rideThrough','time','position','dsq'}
 def safe(value,depth=0):
  if depth>9:return False
  if value is None or isinstance(value,bool):return True
  if isinstance(value,(float,int)):return math.isfinite(value) and abs(value)<1e8
  if isinstance(value,str):return len(value)<500
  if isinstance(value,list):return len(value)<=200 and all(safe(v,depth+1) for v in value)
  if isinstance(value,dict):return len(value)<=40 and all(safe(v,depth+1) for v in value.values())
  return False
 if not safe(ledger):return False
 for rider in riders:
  if not isinstance(rider,dict) or rider.get('id') not in ids or rider['id'] in seen:return False
  seen.add(rider['id']);sanctions=rider.get('sanctions')
  if not isinstance(rider.get('dsq'),bool) or not isinstance(sanctions,list) or len(sanctions)>80:return False
  if any(not isinstance(rider.get(k),(int,float)) or not 0<=rider[k]<=3600 for k in ['timePenalty','positionPenalty']):return False
  for penalty in sanctions:
   if not isinstance(penalty,dict) or not isinstance(penalty.get('id'),int) or penalty['id']<1 or penalty.get('type') not in types or penalty.get('status') not in {'pending','served','applied','converted','escalated'} or not isinstance(penalty.get('reason'),str):return False
   if penalty.get('targetId') is not None and penalty['targetId'] not in ids:return False
 for plan in plans:
  if not isinstance(plan,dict) or plan.get('botId') not in ids or not plan['botId'].startswith('bot-') or plan.get('kind') not in {'pit','longlap','yield'} or not isinstance(plan.get('penaltyId'),int):return False
  if any(not isinstance(plan.get(k),(int,float)) for k in ['anchor','entry']):return False
 return True

def clean_name(value):return ''.join(c for c in str(value) if c.isalnum() or c in ' _.-')[:16].strip() or 'PILOTA'

class Track:
 def __init__(self,data):self.data=data;self.nodes=data['nodes'];self.length=data['length'];self.step=self.length/len(self.nodes)
 def sample(self,s,offset=0):
  f=(s%self.length)/self.step;i=int(f)%len(self.nodes);u=f-int(f);a=self.nodes[i];b=self.nodes[(i+1)%len(self.nodes)]
  yaw=a['yaw']+math.atan2(math.sin(b['yaw']-a['yaw']),math.cos(b['yaw']-a['yaw']))*u
  return {'x':a['x']+(b['x']-a['x'])*u+math.cos(yaw)*offset,'z':a['z']+(b['z']-a['z'])*u-math.sin(yaw)*offset,'y':a.get('y',0)+(b.get('y',0)-a.get('y',0))*u,'heading':yaw}
 def project(self,x,z,near):
  base=int((near%self.length)/self.step);best=1e99;result=near
  for j in range(-40,41):
   i=(base+j)%len(self.nodes);a=self.nodes[i];b=self.nodes[(i+1)%len(self.nodes)];dx=b['x']-a['x'];dz=b['z']-a['z'];u=max(0,min(1,((x-a['x'])*dx+(z-a['z'])*dz)/max(.0001,dx*dx+dz*dz)));d=(x-a['x']-dx*u)**2+(z-a['z']-dz*u)**2
   if d<best:best=d;s=(i+u)*self.step;result=near+(s-near+self.length*.5)%self.length-self.length*.5
  return result,math.sqrt(best)

class Hub:
 def __init__(self,catalog,clock=time.time):self.catalog=catalog;self.tracks={t['id']:Track(t) for t in catalog['tracks']};self.bikes={b['id']:b for b in catalog['bikes']};self.players={};self.rooms={};self.lock=threading.RLock();self.clock=clock
 def add(self,send):
  pid=secrets.token_hex(6)
  with self.lock:self.players[pid]={'id':pid,'name':'PILOTA','bikeId':'r27','livery':'factory','ready':False,'room':None,'send':send,'seen':self.clock()}
  send({'type':'welcome','id':pid,'now':self.clock()*1000,'version':'3.4'});return pid
 def elapsed(self,r):
  if r['status']=='lobby':return 0
  if r['status']=='finished':return r.get('finishElapsed',0)
  now=self.clock();return max(0,now-r.get('startAt',now)-r.get('pausedTotal',0)-(now-r['pauseStart'] if r.get('pauseStart') is not None else 0))
 def bot_roster(self,humans,enabled):
  names=['L. ROSSI','M. SERRA','A. TORRES','D. COSTA','N. MARTIN','E. MORETTI','S. HAYES','F. CONTI','J. VEGA','T. WILSON','R. LECLERC','K. TANAKA','P. SILVA','O. WEBER','L. FERRI','A. NOVAK','M. REED','D. ROMANO','H. SATO'];numbers=[46,63,89,23,12,21,41,54,31,77,28,65,18,92,44,36,58,72,96];bikes=list(self.bikes)
  return [{'id':'bot-'+str(i),'name':names[i],'number':numbers[i],'bikeId':bikes[(humans+i+2)%len(bikes)],'livery':'factory','slot':humans+i,'isBot':True,'ready':True,'finishTime':None,'penalties':0,'progress':0,'dnf':False} for i in range(20-humans)] if enabled else []
 def bot_phase(self,r):
  phases=r.setdefault('botPhases',[{'at':0,'rate':1}]);at=self.elapsed(r);rate={'red':0,'vsc':.3}.get(r['flag'],1)
  restart=phases[-1]['rate']==0 and rate>0
  braking={'brakeSeconds':r['redBrakingSeconds']} if rate==0 and r.get('redBrakingSeconds') else {}
  if abs(phases[-1]['at']-at)<1e-7 and not restart:phases[-1]={'at':at,'rate':rate,**braking}
  elif phases[-1]['rate']!=rate:phases.append({'at':at,'rate':rate,**braking,**({'restart':True} if restart else {})})
 def room_state(self,r):
  now=self.clock();elapsed=self.elapsed(r)
  players=[]
  for pid in r['players']:
   p=self.players.get(pid)
   if not p:continue
   players.append({k:p.get(k) for k in ['id','name','bikeId','livery','ready','slot','pose','progress','finishTime','rawFinishTime','penalties','dnf','dsq','sanctions','timePenalty','positionPenalty']})
  bots=self.bot_roster(len(players),r['options'].get('bots')) if r['status']=='lobby' else r.get('bots',[])
  order=sorted(players+bots,key=lambda p:(bool(p.get('dsq')),bool(p.get('dnf')),p['finishTime'] is None,p['finishTime'] if p['finishTime'] is not None else -finite(p['progress'])))
  finishers=[p for p in order if p['finishTime'] is not None and not p.get('dnf') and not p.get('dsq')]
  for rider in [p for p in finishers if p.get('positionPenalty',0)>0]:
   start=finishers.index(rider);finishers.pop(start);finishers.insert(min(len(finishers),start+int(rider['positionPenalty'])),rider)
  order=finishers+[p for p in order if p not in finishers]
  return {'type':'room','code':r['code'],'hostId':r['host'],'status':r['status'],'options':r['options'],'roundId':r.get('roundId'),'startAt':r.get('startAt',0)*1000,'now':now*1000,'elapsed':elapsed,'players':players,'bots':bots,'gridHumans':r.get('gridHumans'),'botPhases':r.get('botPhases',[{'at':0,'rate':1}]),'order':[p['id'] for p in order],'flag':r.get('flag','green'),'flagRemaining':max(0,r.get('flagUntil',0)-now),'redStartedAt':r['pauseStart']*1000 if r.get('pauseStart') is not None else None,'redBrakingSeconds':r.get('redBrakingSeconds'),'redGridReady':r.get('redGridReady',False),'flagZones':[{**z,'remaining':max(0,z['until']-now)} for z in r.get('flagZones',[])],'zoneHistory':r.get('zoneHistory',[]),'flagZone':r.get('flagZone'),'stewardLedger':r.get('stewardLedger'),'stock':True}
 def broadcast(self,r):
  with self.lock:data=self.room_state(r);sends=[self.players[x]['send'] for x in r['players'] if x in self.players]
  for send in sends:
   try:send(data)
   except (OSError,ConnectionError):pass
 def leave(self,pid):
  with self.lock:
   p=self.players.get(pid)
   if not p:return
   r=self.rooms.get(p.get('room'));p['room']=None;p['ready']=False
   if not r:return
   if pid in r['players']:r['players'].remove(pid)
   if not r['players']:self.rooms.pop(r['code'],None);return
   if r['host']==pid:r['host']=r['players'][0]
  self.broadcast(r)
 def remove(self,pid):self.leave(pid);self.players.pop(pid,None)
 def incident(self,r,p,severity):
  now=self.clock()
  if now-p.get('incidentAt',-100)<4:return
  p['incidentAt']=now
  if r.get('flag')=='red':return
  r['incidents']=[x for x in r.get('incidents',[]) if now-x<18]+[now];r['flagZone']=p.get('progress',0)
  zone=None
  if severity>=3:
   speeds=[finite(self.players[x].get('pose',{}).get('speed')) for x in r['players']]
   speeds.extend(min(self.bikes[b['bikeId']]['top'],300)/3.6 for b in r.get('bots',[]) if b['finishTime'] is None)
   r['redBrakingSeconds']=red_braking_seconds(max(speeds,default=0),r['options']['weather'])
   elapsed=self.elapsed(r)
   r['zoneHistory']=[{**event,'endAt':elapsed,'endPhaseCount':len(r['botPhases'])} if event['at']+event['duration']>elapsed else event for event in r.get('zoneHistory',[])]
   r['redGridReady']=False;r['redReadyAt']=now+r['redBrakingSeconds'] if all(self.players[x].get('dnf') or self.players[x].get('finishTime') is not None or finite((self.players[x].get('pose') or {}).get('speed'))<.3 and finite((self.players[x].get('pose') or {}).get('crash'))<=0 for x in r['players']) else None
   r['flagZones']=[];r['flag']='red';r['flagUntil']=now+r['redBrakingSeconds']+RED_STOP_HOLD_SECONDS+START_LIGHT_SECONDS;r['pauseStart']=now
  else:
   track=self.tracks[r['options']['trackId']];pose=p.get('pose') or {};q=track.sample(p.get('progress',0));offset=math.hypot(pose.get('x',q['x'])-q['x'],pose.get('z',q['z'])-q['z'])
   zone=make_flag_zone(p.get('progress',0),offset<track.data['halfWidth']+.3,track.length);zone['until']=now+12
   zones=r.setdefault('flagZones',[]);existing=next((z for z in zones if z['id']==zone['id']),None)
   if existing:existing.update(until=max(existing['until'],zone['until']),flag='doubleyellow' if 'doubleyellow' in (existing['flag'],zone['flag']) else 'yellow')
   else:zones.append(zone)
   r['flag']='yellow';r['flagUntil']=max(z['until'] for z in zones)
  self.bot_phase(r)
  if zone:r['zoneHistory']=[*r.get('zoneHistory',[]),{'at':self.elapsed(r),'duration':12,'phaseCount':len(r['botPhases']),'zone':zone}]
 def handle(self,pid,msg):
  if not isinstance(msg,dict):return
  with self.lock:
   p=self.players.get(pid)
   if not p:return
   now=self.clock();p['seen']=now;kind=msg.get('type');r=self.rooms.get(p.get('room'))
   def error(text):p['send']({'type':'error','message':text})
   if kind=='ping':p['send']({'type':'pong','now':now*1000,'echo':msg.get('at',0)});return
   if kind=='leave':self.leave(pid);p['send']({'type':'left'});return
   if kind in ('create','join'):
    if r:self.leave(pid)
    p['name']=clean_name(msg.get('name'));p['bikeId']=msg.get('bikeId') if msg.get('bikeId') in self.bikes else 'r27';p['livery']=msg.get('livery') if msg.get('livery') in ['factory','heritage','stealth'] else 'factory'
    if kind=='create':
     if len(self.rooms)>=12:error('Troppe stanze aperte.');return
     code=''.join(secrets.choice('ABCDEFGHJKLMNPQRSTUVWXYZ23456789') for _ in range(5))
     while code in self.rooms:code=''.join(secrets.choice('ABCDEFGHJKLMNPQRSTUVWXYZ23456789') for _ in range(5))
     opt=msg.get('options');opt=opt if isinstance(opt,dict) else {};track=opt.get('trackId') if opt.get('trackId') in self.tracks else next(iter(self.tracks));weather=opt.get('weather') if opt.get('weather') in ['day','sunset','rain'] else 'day';laps=int(finite(opt.get('laps'),3));laps=laps if laps in [2,3,5] else 3
     r={'code':code,'host':pid,'players':[],'status':'lobby','options':{'trackId':track,'weather':weather,'laps':laps,'bots':opt.get('bots') is True},'flag':'green','flagUntil':0,'pausedTotal':0};self.rooms[code]=r
    else:
     r=self.rooms.get(str(msg.get('code','')).strip().upper())
     if not r:error('Codice stanza non trovato.');return
     if r['status']!='lobby':error('La gara è già iniziata.');return
     if len(r['players'])>=8:error('La stanza è piena.');return
    r['players'].append(pid);p['room']=r['code'];p['ready']=False;p['progress']=0;p['pose']=None;p['finishTime']=None;p['penalties']=0;p['dnf']=False
   elif not r:return
   elif kind in ('bike','settings'):
    if r['status']!='lobby':return
    changed=False
    if kind=='bike':
     bike=msg.get('bikeId');livery=msg.get('livery',p['livery'])
     if bike not in self.bikes or livery not in ['factory','heritage','stealth']:return
     changed=p['bikeId']!=bike or p['livery']!=livery;p.update(bikeId=bike,livery=livery)
    else:
     if r['host']!=pid:error('Solo il creatore può modificare la gara.');return
     opt=msg.get('options')
     if not isinstance(opt,dict):return
     if opt.get('trackId') in self.tracks and opt['trackId']!=r['options']['trackId']:r['options']['trackId']=opt['trackId'];changed=True
     if isinstance(opt.get('bots'),bool) and opt['bots']!=r['options'].get('bots',False):r['options']['bots']=opt['bots'];changed=True
    if not changed:return
    for who in r['players']:self.players[who]['ready']=False
   elif kind=='ready' and r['status']=='lobby':p['ready']=bool(msg.get('ready'))
   elif kind=='start':
    if r['host']!=pid:error('Solo il creatore può avviare la gara.');return
    if (len(r['players'])<2 and not r['options'].get('bots')) or not all(self.players[x]['ready'] for x in r['players']):error('Servono due piloti oppure i bot attivi, e tutti devono essere pronti.');return
    if r['status']!='lobby':return
    r.update(gridHumans=len(r['players']),bots=self.bot_roster(len(r['players']),r['options'].get('bots')),botPhases=[{'at':0,'rate':1}],flagZones=[],zoneHistory=[],stewardLedger=None,finishElapsed=None,status='race',roundId=secrets.token_hex(8),startAt=now+4,pausedTotal=0,pauseStart=None,flag='green',flagUntil=now+8,incidents=[],leaderFinish=None)
    t=self.tracks[r['options']['trackId']]
    for slot,who in enumerate(r['players']):
     q=self.players[who];s=-10-slot*7.0;offset=1.85 if slot%2 else -1.85;q.update(slot=slot,progress=s,pose={**t.sample(s,offset),'speed':0,'lean':0,'pitch':0,'wheelie':0,'travel':0,'crash':0},finishTime=None,rawFinishTime=None,penalties=0,resetPenalties=0,dsq=False,sanctions=[],timePenalty=0,positionPenalty=0,dnf=False,lastPose=now+4,incidentAt=-100,violation=0,penaltyAt=-100)
   elif kind=='stewards' and r['status']=='race' and r['host']==pid and msg.get('roundId')==r['roundId']:
    ledger=msg.get('ledger');ids=set(r['players'])|{b['id'] for b in r.get('bots',[])}
    if not valid_steward_ledger(ledger,ids) or ledger['revision']<=(r.get('stewardLedger') or {}).get('revision',-1):return
    r['stewardLedger']=ledger
    for legal in ledger['riders']:
     rider=self.players.get(legal['id']) if legal['id'] in r['players'] else next((b for b in r.get('bots',[]) if b['id']==legal['id']),None)
     if rider is None:continue
     rider.update({k:legal[k] for k in ['sanctions','timePenalty','positionPenalty','dsq']})
     rider['penalties']=rider.get('resetPenalties',0)+legal['timePenalty']
     if rider.get('rawFinishTime') is not None:rider['finishTime']=rider['rawFinishTime']+rider['penalties']
     if legal['dsq']:
      rider['dnf']=True;rider['finishTime']=None
      if legal.get('retirement'):rider['progress']=legal['retirement']['progress']
   elif kind=='bot_finish' and r['status']=='race' and r['host']==pid:
    bot=next((b for b in r.get('bots',[]) if b['id']==msg.get('id')),None);reported=finite(msg.get('time'),-1);minimum=self.tracks[r['options']['trackId']].length*r['options']['laps']/112
    if not bot or bot.get('dsq') or bot['finishTime'] is not None or reported<minimum or reported>self.elapsed(r)+.25:return
    bot['rawFinishTime']=reported;bot['finishTime']=reported+bot.get('penalties',0);bot['progress']=self.tracks[r['options']['trackId']].length*r['options']['laps']
    if r['leaderFinish'] is None:r['leaderFinish']=now
   elif kind=='reset' and r['status']=='race':
    t=self.tracks[r['options']['trackId']];p['pose']={**t.sample(p.get('progress',0)),'speed':min(18,finite(p.get('pose',{}).get('speed'))),'lean':0,'pitch':0,'wheelie':0,'travel':finite(p.get('pose',{}).get('travel')),'crash':0};p['resetPenalties']=p.get('resetPenalties',0)+(0 if r['flag']=='red' else 2);p['penalties']=p['resetPenalties']+p.get('timePenalty',0);p['lastPose']=now;p['send']({'type':'reset','pose':p['pose'],'progress':p['progress']})
   elif kind=='incident' and r['status']=='race':self.incident(r,p,max(1,min(3,int(finite(msg.get('severity'),1)))))
   elif kind=='pose' and r['status']=='race' and now>=r['startAt'] and p.get('finishTime') is None and not p.get('dnf'):
    q=msg.get('pose')
    if not isinstance(q,dict):return
    required=['x','z','heading','speed','lean','pitch','wheelie','travel','crash']
    if any(not isinstance(q.get(k),(int,float)) or not math.isfinite(q[k]) for k in required):return
    old=p['pose'];delta=max(.001,min(2,now-p.get('lastPose',now)));distance=math.hypot(q['x']-old['x'],q['z']-old['z'])
    if q['speed']<0 or q['speed']>112 or distance>delta*125+7:return
    t=self.tracks[r['options']['trackId']];progress,offset=t.project(q['x'],q['z'],p['progress'])
    if progress-p['progress']>delta*125+10:return
    previous_progress=p['progress'];p['progress']=progress;p['lastPose']=now;p['pose']={k:float(q[k]) for k in required};p['pose']['y']=t.sample(progress)['y']
    if r['flag']=='vsc' and q['speed']>27:
     p['violation']=p.get('violation',0)+delta
     if p['violation']>3 and now-p.get('penaltyAt',0)>6:p['resetPenalties']=p.get('resetPenalties',0)+3;p['penalties']+=3;p['penaltyAt']=now;p['violation']=0;p['send']({'type':'penalty','seconds':3,'reason':'VSC'})
    else:p['violation']=max(0,p.get('violation',0)-delta)
    if r['flag']!='red' and progress>=t.length*r['options']['laps']:
     elapsed=max(0,now-r['startAt']-r['pausedTotal']);p['rawFinishTime']=elapsed;p['finishTime']=elapsed+p['penalties'];p['pose']['speed']=0
     if r['leaderFinish'] is None:r['leaderFinish']=now
   elif kind=='lobby' and r['host']==pid:
    if r['status']=='finished':r['status']='lobby';r['flag']='green';r['flagUntil']=0;[self.players[x].update(ready=False) for x in r['players']]
   else:return
  if kind!='pose':self.broadcast(r)
 def tick(self):
  now=self.clock()
  with self.lock:
   rooms=list(self.rooms.values())
   for r in rooms:
    if r['flag']=='red':
     stopped=all(self.players[x].get('dnf') or self.players[x].get('finishTime') is not None or finite((self.players[x].get('pose') or {}).get('speed'))<.3 and finite((self.players[x].get('pose') or {}).get('crash'))<=0 for x in r['players'])
     if not stopped:r['redReadyAt']=None;r['redGridReady']=False;r['flagUntil']=max(r['flagUntil'],now+RED_STOP_HOLD_SECONDS+START_LIGHT_SECONDS)
     else:
      if r.get('redReadyAt') is None:r['redReadyAt']=now
      ready_at=max(r['redReadyAt'],r['pauseStart']+r['redBrakingSeconds'])+RED_STOP_HOLD_SECONDS
      r['redGridReady']=now>=ready_at;r['flagUntil']=max(r['flagUntil'],ready_at+START_LIGHT_SECONDS)
    if r['flag']=='yellow':
     r['flagZones']=[z for z in r.get('flagZones',[]) if z['until']>now];r['flagUntil']=max([now,*[z['until'] for z in r['flagZones']]])
    if r['flag'] in ('yellow','vsc','red') and now>=r['flagUntil']:
     if r.get('pauseStart') is not None:r['pausedTotal']+=now-r['pauseStart'];r['pauseStart']=None
     r['flag']='green';r['flagUntil']=now+4;self.bot_phase(r)
    participants=[self.players[x] for x in r['players']]+r.get('bots',[])
    classified=all(p.get('finishTime') is not None or p.get('dnf') for p in participants)
    if r['status']=='race' and (classified or r.get('leaderFinish') is not None and now-r['leaderFinish']>40):
     r['finishElapsed']=self.elapsed(r);r['status']='finished';r['flag']='chequered';r['flagUntil']=now+1e6
     for b in r.get('bots',[]):
      if b['finishTime'] is None:b['dnf']=True
     for x in r['players']:
      if self.players[x].get('finishTime') is None:self.players[x]['dnf']=True
  for r in rooms:self.broadcast(r)

def websocket_frame(payload,opcode=1):
 data=payload if isinstance(payload,bytes) else json.dumps(payload,separators=(',',':'),ensure_ascii=False).encode();n=len(data)
 return bytes([0x80|opcode,n]) + data if n<126 else bytes([0x80|opcode,126])+struct.pack('!H',n)+data if n<65536 else bytes([0x80|opcode,127])+struct.pack('!Q',n)+data

def read_frame(stream):
 def exact(n):
  out=stream.read(n)
  if len(out)!=n:raise EOFError
  return out
 a,b=exact(2);n=b&127
 if a&0x70 or not b&128:raise ValueError('Invalid frame')
 if n==126:n=struct.unpack('!H',exact(2))[0]
 elif n==127:n=struct.unpack('!Q',exact(8))[0]
 if n>65536 or a&15>=8 and (n>125 or not a&128):raise ValueError('Frame too large')
 mask=exact(4);raw=exact(n);return bool(a&128),a&15,bytes(v^mask[i%4] for i,v in enumerate(raw))

class Handler(BaseHTTPRequestHandler):
 protocol_version='HTTP/1.1'
 def log_message(self,*args):pass
 def do_GET(self):
  path=urlparse(self.path).path
  if path=='/ws' and self.headers.get('Upgrade','').lower()=='websocket':return self.websocket()
  if path=='/api/info':return self.respond(json.dumps({'version':'3.4','addresses':addresses(self.server.server_port),'rooms':[{'code':r['code'],'players':len(r['players']),'status':r['status'],'trackId':r['options']['trackId']} for r in list(self.server.hub.rooms.values())]}).encode(),'application/json')
  relative='index.html' if path=='/' else unquote(path).lstrip('/');target=(self.server.root/relative).resolve()
  if not target.is_relative_to(self.server.root) or target.suffix.lower() not in ['.html','.js','.css','.json','.svg','.png','.jpg','.ico','.gz','.obj','.mtl'] or not target.is_file():self.send_error(404);return
  return self.respond(target.read_bytes(),mimetypes.guess_type(target.name)[0] or 'application/octet-stream')
 def respond(self,data,mime):
  self.send_response(200);self.send_header('Content-Type',mime+'; charset=utf-8' if mime.startswith('text/') or mime=='application/json' else mime);self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.end_headers();self.wfile.write(data)
 def websocket(self):
  origin=self.headers.get('Origin','');key=self.headers.get('Sec-WebSocket-Key','')
  if origin and urlparse(origin).netloc!=self.headers.get('Host'):self.send_error(403);return
  try:valid=len(base64.b64decode(key,validate=True))==16
  except ValueError:valid=False
  if not valid or self.headers.get('Sec-WebSocket-Version')!='13':self.send_error(400);return
  self.send_response(101);self.send_header('Upgrade','websocket');self.send_header('Connection','Upgrade');self.send_header('Sec-WebSocket-Accept',base64.b64encode(hashlib.sha1((key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest()).decode());self.end_headers();self.wfile.flush();self.connection.setsockopt(socket.IPPROTO_TCP,socket.TCP_NODELAY,1)
  lock=threading.Lock();self.connection.settimeout(90)
  def send(payload,opcode=1):
   with lock:self.connection.sendall(websocket_frame(payload,opcode))
  pid=self.server.hub.add(send);fragments=bytearray()
  try:
   while True:
    final,op,data=read_frame(self.rfile)
    if op==8:send(data,8);break
    if op==9:send(data,10);continue
    if op==10:continue
    if op not in (0,1):raise ValueError('Text required')
    fragments.extend(data)
    if len(fragments)>65536:raise ValueError('Message too large')
    if final:
     try:message=json.loads(fragments.decode('utf8'))
     except (ValueError,UnicodeError):raise ValueError('Invalid JSON')
     fragments.clear();self.server.hub.handle(pid,message)
  except (OSError,EOFError,ValueError):pass
  finally:self.server.hub.remove(pid);self.close_connection=True

def addresses(port):
 found={'127.0.0.1'}
 try:found.update(socket.gethostbyname_ex(socket.gethostname())[2])
 except OSError:pass
 return [f'http://{ip}:{port}' for ip in sorted(found) if ipaddress.ip_address(ip).is_private or ip.startswith('127.')]

def create_server(host='0.0.0.0',port=8765,root=None,catalog=None):
 root=(Path(root) if root else ROOT/'dist').resolve();catalog=catalog or json.loads((ROOT/'data'/'race-data.json').read_text(encoding='utf-8'));server=ThreadingHTTPServer((host,port),Handler);server.daemon_threads=True;server.root=root;server.hub=Hub(catalog);return server

def main():
 if sys.version_info<(3,10):print('Serve Python 3.10 o successivo per ospitare la partita LAN.');return 1
 parser=argparse.ArgumentParser(description='ApexGP LAN, senza servizi esterni');parser.add_argument('--host',default='0.0.0.0');parser.add_argument('--port',type=int,default=8765);parser.add_argument('--no-browser',action='store_true');parser.add_argument('--strictPort',action='store_true',help=argparse.SUPPRESS);args=parser.parse_args()
 try:server=create_server(args.host,args.port)
 except OSError as e:print(f'Impossibile avviare il server sulla porta {args.port}: {e}\nChiudi un eventuale server gia aperto oppure avvia: python server.py --port 8766');return 1
 print('\nAPEX GP 3.4 | SERVER LAN\nLascia aperta questa finestra durante la gara.\n')
 for url in addresses(server.server_port):print('Apri nel browser: '+url)
 print('\nGli altri PC devono essere sulla stessa rete e aprire l’indirizzo IP di questo computer.\nPer chiudere: Ctrl+C.\n',flush=True)
 stopped=threading.Event()
 def ticks():
  while not stopped.wait(.05):server.hub.tick()
 threading.Thread(target=ticks,daemon=True).start()
 if not args.no_browser:threading.Timer(.6,lambda:webbrowser.open(f'http://localhost:{server.server_port}')).start()
 try:server.serve_forever()
 except KeyboardInterrupt:pass
 finally:stopped.set();server.server_close()
if __name__=='__main__':raise SystemExit(main())
