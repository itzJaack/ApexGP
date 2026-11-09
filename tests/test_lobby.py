import json,sys,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from server import Hub
class LobbyTests(unittest.TestCase):
 def setUp(self):
  self.now=1000.;self.hub=Hub(json.loads((ROOT/'data/race-data.json').read_text(encoding='utf-8')),lambda:self.now);self.a=self.hub.add(lambda m:None);self.b=self.hub.add(lambda m:None);self.hub.handle(self.a,{'type':'create','name':'A','bikeId':'r27','options':{'trackId':'toscana','laps':2}});self.code=self.hub.players[self.a]['room'];self.r=self.hub.rooms[self.code];self.hub.handle(self.b,{'type':'join','name':'B','bikeId':'v4','code':self.code})
 def send(self,p,kind,**fields):self.hub.handle(p,{'type':kind,**fields})
 def ready(self):
  for p in [self.a,self.b]:self.send(p,'ready',ready=True)
 def test_same_room_edits_own_bike_host_track_and_bots_with_readiness(self):
  self.ready();self.send(self.b,'settings',options={'trackId':'atlas','bots':True});self.assertEqual(self.r['options']['trackId'],'toscana');self.assertTrue(all(self.hub.players[p]['ready'] for p in self.r['players']));self.send(self.b,'bike',bikeId='v2c',livery='heritage');self.assertEqual(self.hub.players[self.b]['bikeId'],'v2c');self.assertFalse(any(self.hub.players[p]['ready'] for p in self.r['players']));self.ready();self.send(self.b,'bike',bikeId='v2c',livery='heritage');self.send(self.a,'settings',options={'trackId':'invalid','bots':'true'});self.assertTrue(all(self.hub.players[p]['ready'] for p in self.r['players']));self.send(self.a,'settings',options={'trackId':'atlas','bots':True});state=self.hub.room_state(self.r);self.assertEqual(state['code'],self.code);self.assertEqual(state['options']['trackId'],'atlas');self.assertEqual(len(state['players']),2);self.assertEqual(len(state['bots']),18);self.assertFalse(any(p['ready'] for p in state['players']));self.ready();self.send(self.a,'start');self.send(self.b,'bike',bikeId='r27');self.send(self.a,'settings',options={'bots':False});self.assertEqual(self.hub.players[self.b]['bikeId'],'v2c');self.assertTrue(self.r['options']['bots'])
 def test_one_human_starts_with_nineteen_bots_and_finish_reports_are_host_only_validated(self):
  self.hub.leave(self.b);self.send(self.a,'settings',options={'bots':True});self.send(self.a,'ready',ready=True);self.send(self.a,'start');self.assertEqual(self.r['status'],'race');self.assertEqual(len(self.r['bots']),19);self.now+=4.1;self.send(self.a,'bot_finish',id='bot-0',time=1);self.assertIsNone(self.r['bots'][0]['finishTime']);self.now+=250
  for i in range(19):self.send(self.a,'bot_finish',id='bot-'+str(i),time=200+i)
  self.assertEqual(self.r['bots'][0]['finishTime'],200);self.send(self.a,'bot_finish',id='bot-0',time=240);self.assertEqual(self.r['bots'][0]['finishTime'],200);self.now+=41;self.hub.tick();self.assertEqual(self.r['status'],'finished');state=self.hub.room_state(self.r);self.assertEqual(state['order'][-1],self.a);self.assertEqual(len(state['order']),20);elapsed=state['elapsed'];self.now+=5;self.assertEqual(self.hub.room_state(self.r)['elapsed'],elapsed);self.send(self.a,'lobby');self.send(self.a,'settings',options={'trackId':'canyon','bots':False});self.assertEqual(self.r['code'],self.code);self.assertEqual(len(self.hub.room_state(self.r)['bots']),0)
 def test_bot_caution_timeline_is_shared_and_race_clock_freezes(self):
  self.send(self.a,'settings',options={'bots':True});self.ready();self.send(self.a,'start');self.now+=24;self.send(self.a,'incident',severity=2);self.assertEqual(self.r['botPhases'][-1]['rate'],1);self.assertEqual(len(self.r['flagZones']),1);self.now+=5;self.send(self.a,'incident',severity=3);elapsed=self.hub.elapsed(self.r);self.assertEqual(self.r['botPhases'][-1]['rate'],0);self.assertGreater(self.r['botPhases'][-1]['brakeSeconds'],3);self.now=self.r['flagUntil']+.1;self.hub.tick();self.assertEqual(self.r['flag'],'green');self.assertAlmostEqual(self.hub.elapsed(self.r),elapsed);self.assertEqual(self.r['botPhases'][-1]['rate'],1)
 def test_host_steward_decisions_apply_to_bots_but_peer_and_malformed_reports_are_rejected(self):
  self.send(self.a,'settings',options={'bots':True});self.ready();self.send(self.a,'start');self.now+=5
  bot=self.r['bots'][0];sanction={'id':1,'type':'dsq','status':'applied','reason':'Ripetute infrazioni','issuedAt':1,'notifiedLap':0}
  ledger={'revision':1,'nextId':2,'botPlans':[],'riders':[{'id':bot['id'],'dsq':True,'sanctions':[sanction],'timePenalty':0,'positionPenalty':0}]}
  self.send(self.b,'stewards',roundId=self.r['roundId'],ledger=ledger);self.assertIsNone(self.r['stewardLedger'])
  self.send(self.a,'stewards',roundId='old-round',ledger=ledger);self.assertIsNone(self.r['stewardLedger'])
  self.send(self.a,'stewards',roundId=self.r['roundId'],ledger={**ledger,'riders':[None]});self.assertIsNone(self.r['stewardLedger'])
  self.send(self.a,'stewards',roundId=self.r['roundId'],ledger=ledger);self.assertTrue(bot['dsq']);self.assertTrue(bot['dnf']);self.assertEqual(self.hub.room_state(self.r)['order'][-1],bot['id'])
  self.now+=250;self.send(self.a,'bot_finish',id=bot['id'],time=200);self.assertIsNone(bot['finishTime'])
 def test_red_grid_waits_for_actual_stop_before_restart_lights(self):
  self.ready();self.send(self.a,'start');self.now+=5;peer=self.hub.players[self.b];peer['pose']['speed']=50;peer['pose']['crash']=3
  self.send(self.a,'incident',severity=3);self.now=self.r['flagUntil']+.1;self.hub.tick();self.assertEqual(self.r['flag'],'red');self.assertFalse(self.r['redGridReady'])
  peer['pose']['speed']=0;peer['pose']['crash']=0;self.now+=.1;self.hub.tick();self.assertEqual(self.r['flag'],'red');self.now+=1.5;self.hub.tick();self.assertTrue(self.r['redGridReady'])
  self.now=self.r['flagUntil']+.1;self.hub.tick();self.assertEqual(self.r['flag'],'green')
 def test_stop_and_go_plan_is_relayed_to_peers_and_an_invalid_hold_cannot_replace_it(self):
  self.send(self.a,'settings',options={'bots':True});self.ready();self.send(self.a,'start');self.now+=5
  bot=self.r['bots'][0]
  ledger={'revision':1,'nextId':2,'botPlans':[{'botId':bot['id'],'kind':'pit','penaltyId':1,'anchor':100,'entry':200,'lap':0,'stopSeconds':5}],
   'riders':[{'id':bot['id'],'dsq':False,'sanctions':[{'id':1,'type':'stopGo','status':'pending','reason':'Velocità ai box','stopSeconds':5}],'timePenalty':0,'positionPenalty':0}]}
  self.send(self.a,'stewards',roundId=self.r['roundId'],ledger=ledger)
  self.assertEqual(self.r['stewardLedger']['botPlans'][0]['stopSeconds'],5)
  bad={**ledger,'revision':2,'botPlans':[{**ledger['botPlans'][0],'stopSeconds':999}]}
  self.send(self.a,'stewards',roundId=self.r['roundId'],ledger=bad)
  self.assertEqual(self.r['stewardLedger']['revision'],1)
 def test_all_disqualified_riders_close_the_race_without_a_finisher(self):
  self.send(self.a,'settings',options={'bots':True});self.ready();self.send(self.a,'start');self.now+=5
  ids=self.r['players']+[b['id'] for b in self.r['bots']]
  legal=[{'id':who,'dsq':True,'sanctions':[{'id':i+1,'type':'dsq','status':'applied','reason':'Ripetute infrazioni'}],'timePenalty':0,'positionPenalty':0} for i,who in enumerate(ids)]
  self.send(self.a,'stewards',roundId=self.r['roundId'],ledger={'revision':1,'nextId':21,'botPlans':[],'riders':legal});self.hub.tick()
  self.assertEqual(self.r['status'],'finished');self.assertTrue(all(p['dsq'] and p['finishTime'] is None for p in self.hub.room_state(self.r)['players']+self.r['bots']))
if __name__=='__main__':unittest.main()
