#!/usr/bin/env python3
"""ApexGP 4.1 model workshop. Original indexed Wavefront assets, metres/Y up/+Z forward.
The game imports these files; no motorcycle or rider geometry is generated in the game.
"""
from pathlib import Path
import gzip,json,math,shutil
import numpy as np
from scipy.spatial import Delaunay
from PIL import Image,ImageDraw,ImageFont
from motorcycles import CATALOG, PROFILES, bodywork, factory_textures, font
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'dist/assets/models';OUT.mkdir(parents=True,exist_ok=True)
TAU=math.tau

MATERIALS={'Paint':([1,.235,.085],.23,.1,6),'Secondary':([.91,.93,.91],.26,.08,6),'Carbon':([.065,.074,.085],.33,.30,10),'Rubber':([.055,.059,.063],.81,0,8),'Titanium':([.44,.47,.50],.24,.88,7),'Aluminium':([.63,.67,.70],.19,.92,7),'DarkMetal':([.12,.14,.16],.29,.85,7),'Gold':([.69,.49,.19],.24,.88,7),'Brake':([.27,.29,.31],.55,.55,10),'Leather':([.045,.053,.062],.58,0,11),'LeatherAccent':([1,.235,.085],.48,0,11),'LeatherWhite':([.86,.88,.87],.55,0,11),'Visor':([.075,.135,.17],.075,.4,9),'Glass':([.50,.65,.71],.08,.1,9),'Lamp':([.75,.88,.98],.12,.15,12),'Accent':([.85,.05,.07],.25,.1,6),'RedLight':([.8,.035,.04],.2,.1,12),'Livery':([1,1,1],.30,0,6),'Number':([1,1,1],.29,0,6),'SuitLogo':([1,1,1],.6,0,11),'SuitNumber':([1,1,1],.6,0,11)}
def norm(v):
 v=np.asarray(v,dtype=float);n=np.linalg.norm(v,axis=-1,keepdims=True);return v/np.maximum(n,1e-12)
def spline(stations,t):
 a=np.asarray(stations,dtype=float);f=np.clip(t,0,1)*(len(a)-1);i=np.minimum(len(a)-2,np.floor(f).astype(int));u=f-i;b=a[i];c=a[i+1];p=a[np.maximum(0,i-1)];q=a[np.minimum(len(a)-1,i+2)];u=np.asarray(u)[...,None];return .5*(2*b+(-p+c)*u+(2*p-5*b+4*c-q)*u*u+(-p+3*b-3*c+q)*u*u*u)
class Model:
 def __init__(self,detail=1):self.parts=[];self.detail=detail
 def surface(self,name,fn,nu,nv,mat,flip=False):
  nu=max(4,round(nu*self.detail));nv=max(3,round(nv*self.detail));u,v=np.meshgrid(np.linspace(0,1,nu+1),np.linspace(0,1,nv+1),indexing='ij');p=fn(u,v);du=fn(np.minimum(1,u+.0001),v)-fn(np.maximum(0,u-.0001),v);dv=fn(u,np.minimum(1,v+.0001))-fn(u,np.maximum(0,v-.0001));n=norm(np.cross(du,dv))*(-1 if flip else 1);bad=np.linalg.norm(n,axis=-1)<.9;n[bad]=np.roll(n,-1,axis=0)[bad];bad=np.linalg.norm(n,axis=-1)<.9;n[bad]=np.roll(n,1,axis=0)[bad];bad=np.linalg.norm(n,axis=-1)<.9;n[bad]=[0,1,0];uv=np.stack([u,v],axis=-1);idx=np.arange((nu+1)*(nv+1)).reshape(nu+1,nv+1);faces=np.stack([idx[:-1,:-1],idx[1:,:-1],idx[1:,1:],idx[:-1,1:]],axis=-1).reshape(-1,4)
  if flip:faces=faces[:,::-1]
  self.parts.append((name,mat,p.reshape(-1,3),n.reshape(-1,3),uv.reshape(-1,2),faces));return self
 def ellipsoid(self,name,center,radii,mat,nu=40,nv=24,pitch=0):
  center=np.array(center);r=np.array(radii);cp,sp=np.cos(pitch),np.sin(pitch)
  def fn(u,v):
   a=u*TAU;b=(v-.5)*(np.pi-1e-5);x=np.sin(a)*np.cos(b)*r[0];y=np.sin(b)*r[1];z=np.cos(a)*np.cos(b)*r[2];return center+np.stack([x,y*cp-z*sp,y*sp+z*cp],axis=-1)
  return self.surface(name,fn,nu,nv,mat,False)
 def tube(self,name,points,radii,mat,nu=28,nv=14):
  points=np.array(points);radii=np.array([r if hasattr(r,'__len__') else [r,r] for r in radii])
  def fn(u,v):
   p=spline(points,u);t=norm(spline(points,np.minimum(1,u+.001))-spline(points,np.maximum(0,u-.001)));ref=np.broadcast_to([1.,0,0],t.shape).copy();ref[np.abs(t[...,0])>.85]=[0,1,0];a=norm(np.cross(t,ref));b=norm(np.cross(t,a));r=spline(radii,u);th=v*TAU;return p+a*(np.cos(th)*r[...,0])[...,None]+b*(np.sin(th)*r[...,1])[...,None]
  return self.surface(name,fn,nu,nv,mat,True)
 def cylinder(self,name,a,b,r,mat,sides=16,r2=None):
  a=np.array(a);b=np.array(b);t=norm(b-a);x=norm(np.cross(t,[1,0,0] if abs(t[0])<.9 else [0,1,0]));y=np.cross(t,x);r2=r if r2 is None else r2
  self.surface(name,lambda u,v:a+(b-a)*u[...,None]+(x*np.cos(v*TAU)[...,None]+y*np.sin(v*TAU)[...,None])*(r+(r2-r)*u)[...,None],1,sides,mat,True)
  for p,R,flip in [(a,r,False),(b,r2,True)]:self.surface(name,lambda u,v,p=p,R=R:p+(x*np.cos(v*TAU)[...,None]+y*np.sin(v*TAU)[...,None])*(u*R)[...,None],1,sides,mat,flip)
 def torus(self,name,center,major,minor,mat,nu=48,nv=10,axis=0):
  c=np.array(center)
  def fn(u,v):
   a=u*TAU;b=v*TAU;r=major+np.cos(b)*minor;p=np.stack([np.sin(b)*minor,np.cos(a)*r,np.sin(a)*r],axis=-1)
   if axis==1:p=p[...,[1,0,2]]
   elif axis==2:p=p[...,[1,2,0]]
   return p+c
  self.surface(name,fn,nu,nv,mat,axis!=0)
 def loft(self,name,sections,mat,nu=60,nv=30):
  def fn(u,v):
   p=spline(sections,u);a=v*TAU;return np.stack([p[...,2]*np.cos(a),p[...,1]+p[...,3]*np.sin(a),p[...,0]],axis=-1)
  self.surface(name,fn,nu,nv,mat,True)
 def disc(self,name,x,outer,inner,mat,holes=20):
  # Both brake faces and cylindrical hole walls are real geometry.
  n=96 if self.detail>.7 else 48;hn=8 if self.detail>.7 else 5
  loops=[np.stack([np.cos(np.linspace(0,TAU,n,endpoint=False))*r,np.sin(np.linspace(0,TAU,n,endpoint=False))*r],axis=-1) for r in [outer,inner]]
  centers=[np.array([np.cos(a),np.sin(a)])*((outer+inner)/2) for a in np.linspace(0,TAU,holes,endpoint=False)];holeR=(outer-inner)*.17
  loops += [c+np.stack([np.cos(np.linspace(0,TAU,hn,endpoint=False)),np.sin(np.linspace(0,TAU,hn,endpoint=False))],axis=-1)*holeR for c in centers]
  pts=np.concatenate(loops);tri=Delaunay(pts).simplices;c=pts[tri].mean(axis=1);keep=(np.linalg.norm(c,axis=1)>inner*.999)&(np.linalg.norm(c,axis=1)<outer*1.001)
  for center in centers:keep&=np.linalg.norm(c-center,axis=1)>holeR*.90
  tri=tri[keep];count=len(pts);p=np.concatenate([np.column_stack([np.full(count,x-.002),pts]),np.column_stack([np.full(count,x+.002),pts])]);normal=np.concatenate([np.tile([-1,0,0],(count,1)),np.tile([1,0,0],(count,1))]);uv=np.tile((pts/outer+1)*.5,(2,1));self.parts.append((name,mat,p,normal,uv,np.concatenate([tri[:,::-1],tri+count])))
  for j,loop in enumerate(loops):
   for k in range(len(loop)):
    a,b=loop[k],loop[(k+1)%len(loop)];p=np.array([[x-.002,*a],[x+.002,*a],[x+.002,*b],[x-.002,*b]]);n=norm(np.cross(p[1]-p[0],p[3]-p[0]));self.parts.append((name,mat,p,np.tile(n,(4,1)),np.array([[0,0],[1,0],[1,1],[0,1]]),np.array([[0,1,2,3]])))
 def save(self,path,mtl,zscale=1):
  lines=['# ApexGP 4.1 | Original reference-based model | metres, Y up, +Z forward','mtllib '+mtl,'s 1'];offset=1;triangles=0;groups=set()
  for name,mat,p,n,uv,faces in self.parts:
   p=p.astype(float).copy();n=n.astype(float).copy();assert np.isfinite(p).all() and np.isfinite(n).all();p[:,2]*=zscale;n[:,2]/=zscale;n=norm(n);lines += ['o '+name,'usemtl '+mat];groups.add(name)
   lines += ['v %.6f %.6f %.6f'%tuple(v) for v in p];lines += ['vt %.6f %.6f'%tuple(v) for v in uv];lines += ['vn %.6f %.6f %.6f'%tuple(v) for v in n]
   for f in faces:
    lines.append('f '+' '.join(f'{i+offset}/{i+offset}/{i+offset}' for i in f));triangles+=len(f)-2
   offset+=len(p)
  data=('\n'.join(lines)+'\n').encode();path.write_bytes(data)
  with gzip.GzipFile(filename='',mode='wb',fileobj=(path.with_suffix('.obj.gz')).open('wb'),compresslevel=9,mtime=0) as f:f.write(data)
  return {'vertices':offset-1,'triangles':triangles,'objects':len(groups),'obj':path.name,'bytes':len(data)}
def textures():
 d=OUT/'textures';d.mkdir(exist_ok=True)
 for variant,ink in [('white',(247,247,239,255)),('dark',(18,27,36,255)),('heritage',(255,241,199,255))]:
  im=Image.new('RGBA',(2048,1024));c=ImageDraw.Draw(im);c.polygon([(45,145),(2025,36),(2025,65),(45,174)],fill=ink);c.line([(45,892),(1960,785)],fill=ink,width=8)
  c.text((75,252),'APEX',font=font(222,True),fill=ink,stroke_width=1);c.text((85,495),'RACING / ENGINEERING',font=font(67),fill=ink)
  c.text((1120,280),'NOVA',font=font(130,True),fill=ink);c.text((1130,472),'AEROFLOW',font=font(59),fill=ink);c.text((1130,573),'RACING OIL',font=font(55),fill=ink);c.text((89,694),'FACTORY DEVELOPMENT',font=font(47),fill=ink);c.text((1135,705),'GP / 2026',font=font(37),fill=ink)
  im.save(d/f'apex_factory_{variant}.png',optimize=True)
  im=Image.new('RGBA',(512,512));c=ImageDraw.Draw(im);c.text((256,248),'27',anchor='mm',font=font(326,True),fill=ink,stroke_width=9,stroke_fill=(18,24,30,255) if variant!='dark' else (248,246,231,255));im.save(d/f'number_27_{variant}.png',optimize=True)
 im=Image.new('RGBA',(1024,512));c=ImageDraw.Draw(im);c.text((512,160),'APEX',anchor='mm',font=font(155,True),fill=(239,242,233,255));c.text((512,325),'RACING TEAM',anchor='mm',font=font(55),fill=(239,242,233,255));im.save(d/'apex_suit.png',optimize=True)
def mtl(path,color,style=None):
 s=['# Original ApexGP materials. Metallic/roughness plus standard Wavefront fallback.']
 for name,(kd,rough,metal,surface) in MATERIALS.items():
  if name in ['Paint','LeatherAccent']:kd=color
  if name=='Accent':kd=[.06,.15,.29] if style=='carbon' else [.85,.05,.07]
  s += ['newmtl '+name,'Ka 0.03 0.03 0.03','Kd '+' '.join(map(str,kd)),'Ks 0.45 0.45 0.45',f'Ns {max(2,int(2/rough**2-2))}',f'Pr {rough}',f'Pm {metal}','illum 2',f'# apex_surface {surface}']
  if name=='Glass':s+=['d 0.32']
  if name in ['Livery','Number','SuitLogo','SuitNumber']:
   file={'Livery':('factory_'+path.stem+'.png' if style else 'apex_factory_white.png'),'Number':'number_27_white.png','SuitLogo':'apex_suit.png','SuitNumber':'number_27_white.png'}[name];s+=['map_Kd textures/'+file,'map_d textures/'+file]
  s.append('')
 path.write_text('\n'.join(s))
def bike(spec,detail):
 id,style,wb,width,rise,wings,color=spec;m=Model(detail);front=wb/2;rear=-front
 # Wheels are authored at their pivots so the importer can animate them independently.
 for group,radius,half in [('front_wheel',.312,.087),('rear_wheel',.326,.114)]:
  def tyre(u,v):
   a=u*TAU;b=v*TAU;r=radius-.044+np.cos(b)*.044;return np.stack([half*np.sin(b),r*np.cos(a),r*np.sin(a)],axis=-1)
  m.surface(group,tyre,128,28,'Rubber')
  for sign in [-1,1]:
   m.torus(group,[sign*half*.68,0,0],.224,.012,'Aluminium',72,10)
   m.torus(group,[sign*half*.71,0,0],.210,.010,'DarkMetal',60,8)
   for j in range(5):
    a=j*TAU/5
    for split in [-1,1]:
     b=a+split*.08;m.tube(group,[[sign*.035,np.cos(b)*.048,np.sin(b)*.048],[sign*.043,np.cos(b+.20)*.134,np.sin(b+.20)*.134],[sign*half*.65,np.cos(b+.29)*.215,np.sin(b+.29)*.215]],[.012,.010,.007],'DarkMetal',12,8)
   if group=='front_wheel' or sign==-1:m.disc(group,sign*(half+.012),.151 if group=='front_wheel' else .118,.105 if group=='front_wheel' else .073,'Brake',22 if group=='front_wheel' else 16)
   for j in range(6):
    a=j*TAU/6;m.cylinder(group,[sign*(half+.015),np.cos(a)*.084,np.sin(a)*.084],[sign*(half+.018),np.cos(a)*.084,np.sin(a)*.084],.005,'Gold',10)
  m.cylinder(group,[-.125,0,0],[.125,0,0],.037,'Aluminium',28)
 # Shared wheel engineering is followed by edition-specific authored bodywork.
 for name,mat,p,n,uv,faces in m.parts:
  if name in ['front_wheel','rear_wheel']:p[:,1]+=.312 if name=='front_wheel' else .326;p[:,2]+=front if name=='front_wheel' else rear
 return bodywork(m,spec)


def rider(detail):
 m=Model(detail)
 # A 1.79 m human in a racing tuck. Ring sections follow the spine, with shoulders
 # and pelvis kept separate from the suit's protective aerodynamic hump.
 m.tube('rider',[[0,.965,-.55],[0,1.04,-.37],[0,1.145,-.15],[0,1.196,.035],[0,1.22,.12]],[[.105,.16],[.105,.158],[.115,.181],[.104,.193],[.067,.12]],'Leather',48,32)
 m.ellipsoid('rider',[0,.965,-.56],[.165,.111,.18],'Leather',40,24,-.18)
 m.ellipsoid('rider',[0,1.205,-.235],[.098,.067,.235],'LeatherAccent',44,24,-.43)
 m.tube('rider',[[0,1.225,.10],[0,1.278,.23]],[.061,.057],'Leather',16,24)
 for sign in [-1,1]:
  hip=[sign*.131,.965,-.53];knee=[sign*.309,.648,-.025];ankle=[sign*.23,.402,-.406]
  m.tube('rider',[hip,[sign*.23,.80,-.30],knee],[[.091,.095],[.089,.10],[.071,.077]],'LeatherAccent',36,24)
  m.tube('rider',[knee,[sign*.267,.50,-.23],ankle],[[.068,.071],[.052,.060],[.042,.050]],'Leather',32,22)
  m.ellipsoid('rider',knee,[.071,.076,.077],'LeatherAccent',32,20,-.50)
  m.ellipsoid('rider',[sign*.356,.65,-.012],[.020,.049,.060],'Carbon',24,16,-.2)
  m.ellipsoid('rider',[sign*.23,.423,-.402],[.054,.097,.066],'LeatherWhite',32,20,-.28)
  m.ellipsoid('rider',[sign*.23,.377,-.35],[.061,.041,.133],'LeatherWhite',32,18,-.10)
  m.ellipsoid('rider',[sign*.23,.355,-.35],[.064,.013,.137],'Rubber',28,14,-.1)
  m.ellipsoid('rider',[sign*.274,.382,-.258],[.016,.018,.042],'Titanium',20,12,-.1)
  m.ellipsoid('rider',[sign*.275,.424,-.41],[.009,.023,.028],'Carbon',20,12)
  shoulder=[sign*.187,1.195,.018];elbow=[sign*.318,1.035,.142];hand=[sign*.313,.975,.354]
  m.tube('rider',[shoulder,[sign*.27,1.13,.064],elbow],[[.072,.077],[.068,.074],[.052,.055]],'LeatherAccent',30,24)
  m.tube('rider',[elbow,[sign*.328,.994,.245],hand],[[.053,.056],[.045,.048],[.031,.035]],'LeatherWhite',28,22)
  m.ellipsoid('rider',shoulder,[.072,.069,.079],'LeatherAccent',32,20,-.2)
  m.ellipsoid('rider',[sign*.227,1.228,.027],[.035,.023,.051],'Titanium',24,14,-.28)
  m.ellipsoid('rider',[sign*.339,1.035,.144],[.018,.035,.041],'Carbon',24,14)
  m.tube('rider',[[sign*.317,.98,.305],hand],[[.042,.040],[.034,.033]],'Leather',16,20)
  m.ellipsoid('rider',hand,[.043,.032,.058],'Leather',28,18,-.25)
  m.ellipsoid('rider',[sign*.313,1.001,.35],[.031,.009,.027],'Carbon',22,12,-.15)
  for j in range(4):
   x=sign*(.288+j*.016);m.tube('rider',[[x,.982,.362],[x,.956,.386],[x,.945,.365]],[[.008,.009],[.007,.008],[.0055,.0065]],'Leather',18,10)
  m.tube('rider',[[sign*.279,.977,.335],[sign*.268,.953,.348],[sign*.28,.944,.36]],[.010,.009,.006],'Leather',18,10)
  # Seams, knee accordion stretch panels and boot closure tabs.
  m.tube('rider',[[sign*.14,1.025,-.52],[sign*.172,1.10,-.29],[sign*.182,1.225,-.04]],[.003,.003,.003],'LeatherWhite',32,6)
  for j in range(6):m.tube('rider',[[sign*.275,.748-j*.012,-.125-j*.012],[sign*.302,.738-j*.012,-.11-j*.012]],[.0025,.0025],'Leather',8,6)
  for j in range(3):m.ellipsoid('rider',[sign*.258,.454+j*.018,-.419],[.020,.006,.035],'Carbon',14,8)
 # Matching shell/visor coordinates avoid the detached visor of the old model.
 hc=np.array([0,1.36,.30]);pitch=-.19;cp,sp=np.cos(pitch),np.sin(pitch)
 def helmet(theta,phi,offset=0):
  x=np.sin(theta)*np.cos(phi)*(.134+offset)*(1-.13*np.clip((-phi-.65)/.8,0,1));y=np.sin(phi)*(.151+offset);z=np.cos(theta)*np.cos(phi)*(.170+offset)+np.maximum(0,np.cos(theta))**4*(.041*np.exp(-((phi+.42)/.25)**2)-.008*np.exp(-((phi-.10)/.25)**2));return hc+np.stack([x,y*cp-z*sp,y*sp+z*cp],axis=-1)
 m.surface('rider',lambda u,v:helmet(u*TAU,(v-.5)*(np.pi-.00001)),72,40,'Secondary',False)
 m.surface('rider',lambda u,v:helmet(-1.33+u*2.66,-.18+v*.55,.0025),52,16,'Rubber',False)
 m.surface('rider',lambda u,v:helmet(-1.29+u*2.58,-.14+v*.47,.004),52,16,'Visor',False)
 m.surface('rider',lambda u,v:helmet(-1.12+u*2.24,-.65+v*.42,.003),44,18,'Secondary',False)
 m.surface('rider',lambda u,v:helmet(-.25+u*.50,-.47+v*.065,.005),24,5,'Carbon',False)
 m.surface('rider',lambda u,v:helmet(-.20+u*.40,-.34+v*.024,.005),20,4,'Carbon',False)
 # Curved crown paint, side pivot seals and aerodynamic rear spoiler.
 for side in [-1,1]:
  m.surface('rider',lambda u,v,side=side:helmet(side*.29+(u-.5)*.16,.46+v*.94,.003),14,32,'LeatherAccent',False)
  p=helmet(np.array(side*1.42),np.array(.05));m.ellipsoid('rider',p,[.004,.015,.015],'Titanium',20,12)
  m.surface('rider',lambda u,v,side=side:helmet(side*(.25+u*.48),.38+v*.025,.004),20,4,'Carbon',False)
 m.ellipsoid('rider',[0,1.38,.128],[.119,.012,.038],'Carbon',32,12,-.20)
 m.surface('suit_logo',lambda u,v:np.stack([(u-.5)*.27,1.20+v*.06,-.38+v*.20],axis=-1),18,16,'SuitLogo',True)
 m.surface('suit_number',lambda u,v:np.stack([(u-.5)*.14,1.19+v*.035,-.50+v*.12],axis=-1),16,14,'SuitNumber',True)
 return m

def main():
 textures();factory_textures(OUT/'textures');manifest={'version':'4.1','units':'metres','up':'Y','forward':'+Z','bikes':{},'rider':{},'textures':{p.stem:'textures/'+p.name for p in sorted((OUT/'textures').glob('*.png'))},'materials':{},'stats':{}}
 for spec in CATALOG:
  id,style,wb,width,rise,wings,color=spec;mtl(OUT/(id+'.mtl'),color,style);manifest['materials'][id]=id+'.mtl';paths={}
  for lod,d in [('high',1),('race',.43)]:
   info=bike(spec,d).save(OUT/(id+'-'+lod+'.obj'),id+'.mtl');paths[lod]=info['obj']+'.gz';manifest['stats'][id+'-'+lod]=info
  manifest['bikes'][style]={'id':id,'wheelbase':wb,'frontRadius':.312,'rearRadius':.326,'factoryTexture':'factory_'+id,'reference':PROFILES[style]['brand']+' '+PROFILES[style]['model'],**paths};print(id,manifest['stats'][id+'-high']['triangles'],flush=True)
 mtl(OUT/'rider.mtl',[1,.235,.085]);manifest['materials']['rider']='rider.mtl'
 for lod,d in [('high',1),('race',.46)]:
  info=rider(d).save(OUT/('gp-rider-'+lod+'.obj'),'rider.mtl');manifest['rider'][lod]=info['obj']+'.gz';manifest['stats']['rider-'+lod]=info
 (OUT/'manifest.json').write_text(json.dumps(manifest,separators=(',',':')))
 (OUT/'MODELLI-LEGGIMI.txt').write_text('APEXGP 4.1 - MODELLI DA RIFERIMENTI REALI\n\nApri i file .obj in Blender o in un altro modellatore con supporto Wavefront. Mantieni i file .mtl accanto agli OBJ e la cartella textures accanto ai materiali. Scala in metri, asse Y in alto, fronte +Z.\n\nLe versioni high sono i modelli principali. Le versioni race sono alleggerite per gli avversari. Le ruote sono esportate montate sulla moto. Il centro di rotazione si trova a Y=0.312, Z=+interasse/2 (anteriore), Y=0.326, Z=-interasse/2 (posteriore). Body, steering, glass, ruote e decalcomanie sono oggetti separati. Il pilota è separato dalla moto; i gruppi suit_logo e suit_number hanno UV dedicate.\n\nIl gioco decomprime e importa i veri file OBJ, mantenendo normali, UV e assegnazioni materiali. Le immagini PNG sono originali e trasparenti. I numeri di gara vengono personalizzati nel gioco. Carrozzeria e tuta ricevono i colori della squadra. Le geometrie sorgenti si possono ricreare con art/create_models.py (Python, NumPy, SciPy e Pillow).\n\nCreati per ApexGP. Geometrie originali basate sulle edizioni reali identificate nel manifest. Nomi e marchi appartengono ai titolari. Nessuna affiliazione ufficiale. Livree senza sponsor, ricostruzioni geometriche approssimate.\n')
 print(json.dumps({'highTriangles':{k:v['triangles'] for k,v in manifest['stats'].items() if k.endswith('high')},'files':len(list(OUT.rglob('*')))}))
if __name__=='__main__':main()
