import base64,importlib.util,json,os,socket,struct,sys,threading,time,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from server import Hub,create_server,websocket_frame,read_frame
CATALOG=json.loads((ROOT/'data'/'race-data.json').read_text())
class Clock:
 def __init__(self):self.value=1000.
 def __call__(self):return self.value
 def advance(self,dt):self.value+=dt
class HubTests(unittest.TestCase):
 def setUp(self):
  self.clock=Clock();self.hub=Hub(CATALOG,self.clock);self.messages={}
  def player(name):
   box=[];pid=self.hub.add(lambda m:box.append(m));self.messages[pid]=box;return pid
  self.a=player('A');self.b=player('B');self.hub.handle(self.a,{'type':'create','name':'JACK','bikeId':'r27','options':{'trackId':'alpine','laps':2,'weather':'day'}});self.code=self.hub.players[self.a]['room'];self.hub.handle(self.b,{'type':'join','name':'AMICO','bikeId':'s3','code':self.code});self.room=self.hub.rooms[self.code]
 def start(self):
  for who in [self.a,self.b]:self.hub.handle(who,{'type':'ready','ready':True})
  self.hub.handle(self.a,{'type':'start'});self.clock.advance(4.1)
 def pose(self,who,s,v=40):
  p=self.hub.players[who];t=self.hub.tracks['alpine'];q=t.sample(s,0);q.update(speed=v,lean=.2,pitch=0,wheelie=0,travel=max(0,s),crash=0);self.hub.handle(who,{'type':'pose','pose':q})
 def test_room_requires_two_ready_players_and_host_permission(self):
  self.hub.handle(self.b,{'type':'start'});self.assertEqual(self.room['status'],'lobby');self.hub.handle(self.a,{'type':'start'});self.assertEqual(self.room['status'],'lobby');self.start();self.assertEqual(self.room['status'],'race');state=self.hub.room_state(self.room);self.assertEqual(len(state['players']),2);self.assertNotEqual(state['players'][0]['pose']['x'],state['players'][1]['pose']['x']);self.assertEqual(state['startAt'],1004000);self.assertTrue(state['stock'])
 def test_invalid_teleports_and_nonfinite_positions_are_ignored(self):
  self.start();p=self.hub.players[self.a];old=dict(p['pose']);self.hub.handle(self.a,{'type':'pose','pose':dict(old,x=10000)});self.assertEqual(p['pose'],old);self.hub.handle(self.a,{'type':'pose','pose':dict(old,x=float('nan'))});self.assertEqual(p['pose'],old)
 def test_two_players_complete_a_race_with_server_projected_progress(self):
  self.start();track=self.hub.tracks['alpine'];finish=track.length*2
  s=0
  while s<finish+5:
   self.clock.advance(.05);self.pose(self.a,s,60);self.pose(self.b,max(-10,s-4),60);s+=3
  for _ in range(5):self.clock.advance(.05);self.pose(self.b,s,60);s+=3
  self.hub.tick();self.assertEqual(self.room['status'],'finished');state=self.hub.room_state(self.room);self.assertEqual(state['order'][0],self.a);self.assertTrue(all(p['finishTime'] is not None for p in state['players']));self.assertEqual(state['flag'],'chequered')
 def test_incidents_and_red_flags_are_shared_and_pause_the_race_clock(self):
  self.start();self.hub.handle(self.a,{'type':'incident','severity':1});self.assertEqual(self.room['flag'],'yellow');self.hub.handle(self.b,{'type':'incident','severity':2});self.assertEqual(self.room['flag'],'vsc');self.clock.advance(5);self.hub.handle(self.a,{'type':'incident','severity':3});before=self.hub.room_state(self.room)['elapsed'];self.assertEqual(self.room['flag'],'red');self.clock.advance(7.1);self.hub.tick();after=self.hub.room_state(self.room)['elapsed'];self.assertAlmostEqual(before,after,places=4);self.assertEqual(self.room['flag'],'green')
 def test_host_disconnect_promotes_the_other_player_and_cleans_empty_rooms(self):
  self.hub.remove(self.a);self.assertEqual(self.room['host'],self.b);self.hub.remove(self.b);self.assertNotIn(self.code,self.hub.rooms)
 def test_reset_is_authoritative_and_adds_a_penalty(self):
  self.start();self.hub.handle(self.a,{'type':'reset'});self.assertEqual(self.hub.players[self.a]['penalties'],2);self.assertTrue(any(m.get('type')=='reset' for m in self.messages[self.a]))
 def test_server_enforces_vsc_speed_limit(self):
  self.start();self.hub.handle(self.a,{'type':'incident','severity':2});s=self.hub.players[self.a]['progress']
  for _ in range(75):self.clock.advance(.05);s+=1.75;self.pose(self.a,s,35)
  self.assertEqual(self.hub.players[self.a]['penalties'],3);self.assertTrue(any(m.get('type')=='penalty' and m.get('reason')=='VSC' for m in self.messages[self.a]))
class Client:
 def __init__(self,port):
  self.sock=socket.create_connection(('127.0.0.1',port),timeout=3);self.stream=self.sock.makefile('rb');key=base64.b64encode(os.urandom(16)).decode();self.sock.sendall((f'GET /ws HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nOrigin: http://127.0.0.1:{port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n').encode());status=self.stream.readline();assert b'101' in status
  while self.stream.readline()!=b'\r\n':pass
  self.id=self.read()['id']
 def send(self,m):
  data=json.dumps(m).encode();mask=os.urandom(4);n=len(data);head=bytes([0x81,0x80|n]) if n<126 else bytes([0x81,0xfe])+struct.pack('!H',n);self.sock.sendall(head+mask+bytes(v^mask[i%4] for i,v in enumerate(data)))
 def read(self):
  a,b=self.stream.read(2);n=b&127
  if n==126:n=struct.unpack('!H',self.stream.read(2))[0]
  if n==127:n=struct.unpack('!Q',self.stream.read(8))[0]
  return json.loads(self.stream.read(n))
 def until(self,predicate):
  for _ in range(30):
   m=self.read()
   if predicate(m):return m
  raise AssertionError('Expected message not received')
 def close(self):self.sock.shutdown(socket.SHUT_RDWR);self.sock.close();self.stream.close()
class WireTests(unittest.TestCase):
 def test_two_independent_websocket_clients_join_ready_and_start(self):
  server=create_server('127.0.0.1',0,catalog=CATALOG);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start();a=b=None
  try:
   a=Client(server.server_port);b=Client(server.server_port);a.send({'type':'create','name':'PC UNO','bikeId':'r27','options':{'trackId':'marina','laps':2}});state=a.until(lambda m:m.get('type')=='room');b.send({'type':'join','name':'PC DUE','bikeId':'v4','code':state['code']});b.until(lambda m:m.get('type')=='room');a.send({'type':'ready','ready':True});b.send({'type':'ready','ready':True});a.until(lambda m:m.get('type')=='room' and all(p['ready'] for p in m['players']));a.send({'type':'start'});sa=a.until(lambda m:m.get('status')=='race');sb=b.until(lambda m:m.get('status')=='race');self.assertEqual(sa['startAt'],sb['startAt']);self.assertEqual(sa['roundId'],sb['roundId']);self.assertEqual(len(sa['players']),2)
  finally:
   for c in [a,b]:
    if c:c.close()
   server.shutdown();server.server_close();thread.join(timeout=2)
if __name__=='__main__':unittest.main()
