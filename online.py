#!/usr/bin/env python3
"""Start ApexGP's own server and a temporary Internet tunnel. No router changes."""
import argparse,collections,hashlib,io,json,os,platform,re,shutil,subprocess,sys,tarfile,threading,time,urllib.request,webbrowser
from pathlib import Path
from server import create_server
ROOT=Path(__file__).resolve().parent
LINK_PATTERN=re.compile(r'https://[a-z0-9-]+\.trycloudflare\.com\b')
def public_link(line):
 for url in LINK_PATTERN.findall(line):
  if url not in ['https://api.trycloudflare.com','https://www.trycloudflare.com']:return url
 return None
def platform_asset(system=None,machine=None):
 system=system or platform.system();machine=(machine or platform.machine()).lower();arch='arm64' if machine in ['aarch64','arm64'] else 'amd64' if machine in ['x86_64','amd64'] else None
 if not arch:raise RuntimeError('Questa architettura non è supportata automaticamente. Installa cloudflared e avvia: python online.py --binary PERCORSO')
 if system=='Windows':return f'cloudflared-windows-{arch}.exe'
 if system=='Darwin':return f'cloudflared-darwin-{arch}.tgz'
 if system=='Linux':return f'cloudflared-linux-{arch}'
 raise RuntimeError('Sistema operativo non supportato.')
def obtain_binary():
 found=shutil.which('cloudflared')
 if found:return Path(found)
 release=json.loads((ROOT/'cloudflared-release.json').read_text());asset=platform_asset();spec=release['assets'].get(asset)
 if not spec:raise RuntimeError('Installa cloudflared dal sito ufficiale Cloudflare e riprova.')
 runtime=ROOT/'runtime';runtime.mkdir(exist_ok=True);target=runtime/('cloudflared.exe' if os.name=='nt' else 'cloudflared');marker=runtime/'cloudflared.version'
 if target.is_file() and marker.is_file() and marker.read_text().strip()==release['version']:return target
 print('Scarico cloudflared '+release['version']+' dalla distribuzione ufficiale Cloudflare. Serve solo sul PC host.',flush=True)
 req=urllib.request.Request(spec['url'],headers={'User-Agent':'ApexGP/3.4'})
 try:
  with urllib.request.urlopen(req,timeout=45) as response:
   data=bytearray();last=0
   while True:
    chunk=response.read(1024*1024)
    if not chunk:break
    data.extend(chunk)
    if len(data)>100*1024*1024:raise RuntimeError('Download inatteso: dimensione troppo grande.')
    if len(data)-last>=5*1024*1024:print(f'  {len(data)//1024//1024} MB scaricati',flush=True);last=len(data)
 except OSError as e:raise RuntimeError('Download di cloudflared non riuscito. Controlla Internet e riprova. '+str(e)) from e
 if not spec.get('sha256') or hashlib.sha256(data).hexdigest()!=spec['sha256']:raise RuntimeError('La verifica del download non è riuscita. Il programma non viene eseguito.')
 if asset.endswith('.tgz'):
  with tarfile.open(fileobj=io.BytesIO(data),mode='r:gz') as tar:
   member=next((m for m in tar.getmembers() if Path(m.name).name=='cloudflared' and m.isfile()),None)
   if not member:raise RuntimeError('Archivio Cloudflare non valido.')
   data=tar.extractfile(member).read()
 temp=target.with_suffix('.download');temp.write_bytes(data);temp.chmod(0o700);temp.replace(target);marker.write_text(release['version']);return target

def main():
 if sys.version_info<(3,10):print('Serve Python 3.10 o successivo sul PC host.');return 1
 parser=argparse.ArgumentParser(description='ApexGP 3.4 - Gioca con amici su Internet');parser.add_argument('--port',type=int,default=8765);parser.add_argument('--binary',type=Path);parser.add_argument('--no-browser',action='store_true');parser.add_argument('--tunnel-only',action='store_true',help=argparse.SUPPRESS);args=parser.parse_args()
 process=None;server=None;stopped=threading.Event();logs=collections.deque(maxlen=30)
 try:
  binary=args.binary.resolve() if args.binary else obtain_binary()
  if not binary.is_file():raise RuntimeError('Cloudflared non trovato: '+str(binary))
  if not args.tunnel_only:
   server=create_server('127.0.0.1',args.port)
   threading.Thread(target=server.serve_forever,daemon=True).start()
   def ticks():
    while not stopped.wait(.05):server.hub.tick()
   threading.Thread(target=ticks,daemon=True).start()
  config=ROOT/'runtime'/'apex-quick.yml';config.parent.mkdir(exist_ok=True);config.write_text('no-autoupdate: true\n')
  command=[str(binary),'tunnel','--config',str(config),'--no-autoupdate','--url',f'http://127.0.0.1:{args.port}','--protocol','http2','--metrics','127.0.0.1:0']
  print('\nAPEX GP 3.4 / MULTIPLAYER INTERNET\nCreo un link temporaneo. Lascia aperta questa finestra durante la partita.\n',flush=True)
  process=subprocess.Popen(command,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,encoding='utf-8',errors='replace',bufsize=1,**({'creationflags':subprocess.CREATE_NEW_PROCESS_GROUP} if os.name=='nt' else {'start_new_session':True}))
  ready=False;candidate=None;connected=False
  for line in process.stdout:
   logs.append(line.rstrip());candidate=public_link(line) or candidate;connected=connected or 'Registered tunnel connection' in line
   if candidate and connected and not ready:
    ready=True;url=candidate;(ROOT/'LINK-PARTITA.txt').write_text('APEXGP - Link temporaneo della partita\n'+url+'\n\nAprilo e condividilo con gli amici. In Multiplayer crea una stanza e condividi anche il codice stanza. Il link termina quando chiudi la finestra del server.\n')
    print('\nIL TUO LINK DA CONDIVIDERE:\n\n  '+url+'\n\nAspetta qualche secondo, poi aprilo anche tu.\nMultiplayer > Crea stanza. Gli amici: stesso link > Multiplayer > codice > Unisciti.\nTutti Pronto, poi Avvia gara. Per terminare tutto: Ctrl+C.\nIl link viene salvato anche in LINK-PARTITA.txt.\n',flush=True)
    if not args.no_browser:threading.Timer(2,lambda:webbrowser.open(url)).start()
   elif 'ERR' in line or 'error' in line.lower():print('Tunnel: '+line.rstrip(),flush=True)
  if not ready or process.wait()!=0:raise RuntimeError('Il tunnel si è chiuso. Controlla Internet e riavvia.\n'+'\n'.join(logs))
 except KeyboardInterrupt:print('\nPartita terminata. Chiudo il collegamento Internet.',flush=True)
 except (OSError,RuntimeError,ValueError) as e:print('\nImpossibile avviare la partita: '+str(e),flush=True);return 1
 finally:
  stopped.set()
  if process and process.poll() is None:
   process.terminate()
   try:process.wait(timeout=4)
   except subprocess.TimeoutExpired:process.kill();process.wait(timeout=3)
  if server:server.shutdown();server.server_close()
 return 0
if __name__=='__main__':raise SystemExit(main())
