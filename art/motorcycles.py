"""Reference-specific motorcycle bodywork, authored offline in metres.

These are original approximations of identified production/racing editions.
Profiles describe the silhouette as well as mechanical differences; changing a
paint colour does not substitute for a different motorcycle model.
"""
import math
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

TAU = math.tau

# id, importer style, wheelbase, colour, brand, model, nose width/height/length,
# tank width/height, tail height/width, aero type, exhaust, headlight arrangement.
REFERENCES = [
    ('r27','factory',1.49,[.88,.035,.055],'DUCATI','DESMOSEDICI GP25',.258,1.025,1.02,.205,1.09,.994,.12,'biplane','gp-twin',None),
    ('v4','v4',1.49,[.045,.19,.64],'YAMAHA','YZR-M1 / 2025',.242,1.005,1.005,.198,1.07,.972,.108,'m1','side-short',None),
    ('rs','silver',1.49,[.085,.095,.115],'aprilia','RS-GP25',.268,1.035,1.035,.187,1.075,1.005,.115,'channels','gp-twin',None),
    ('v2c','corsa',1.465,[.85,.035,.065],'DUCATI','PANIGALE V2',.232,.982,.985,.185,1.065,.963,.102,'none','undertail-twin','panigale'),
    ('x4a','aero',1.49,[.83,.04,.09],'HONDA','RC213V / 2025',.243,1.008,1.015,.193,1.085,.977,.103,'honda-gp','gp-twin',None),
    ('r9e','endurance',1.50,[.035,.35,.82],'SUZUKI','GSX-RR / 2022',.249,1.043,1.025,.204,1.09,.966,.110,'suzuki-gp','side-short',None),
    ('s3','sprint',1.375,[.12,.13,.15],'TRIUMPH','DAYTONA 765 / MOTO2',.224,.979,.97,.178,1.055,.951,.095,'none','low-short','daytona'),
    ('t12','titan',1.471,[.88,.045,.06],'DUCATI','PANIGALE V4 R',.249,1.008,1.025,.198,1.09,.985,.108,'v4r','underbelly','panigale'),
    ('gtr','carbon',1.49,[.96,.22,.025],'KTM','RC16 / 2025',.265,1.018,1.025,.199,1.09,.995,.118,'ktm','gp-twin',None),
    ('i4','sakura',1.45,[.24,.68,.025],'Kawasaki','NINJA ZX-10RR',.265,1.047,1.015,.205,1.075,.975,.122,'integrated','side-long','ninja'),
    ('bmw','bmw',1.457,[.89,.91,.93],'BMW','M 1000 RR',.264,1.023,1.025,.201,1.095,.984,.117,'bmw','side-long','bmw'),
    ('rsv4','rsv4',1.435,[.10,.105,.12],'aprilia','RSV4 FACTORY',.249,1.005,.99,.195,1.075,.978,.101,'rsv4','side-long','triple'),
    ('r1','r1',1.405,[.04,.14,.72],'YAMAHA','YZF-R1 / 2024',.238,1.012,.99,.20,1.08,1.008,.103,'none','side-long','r1'),
    ('fireblade','fireblade',1.455,[.84,.035,.065],'HONDA','CBR1000RR-R SP',.251,.995,1.015,.191,1.07,.983,.109,'integrated','side-long','fireblade'),
    ('gsxr','gsxr',1.42,[.035,.32,.75],'SUZUKI','GSX-R1000R',.252,1.027,1.01,.206,1.095,.96,.125,'none','side-large','single'),
]
PROFILES = {row[1]: dict(zip(
    ['id','style','wheelbase','color','brand','model','noseWidth','noseHeight','noseLength',
     'tankWidth','tankHeight','tailHeight','tailWidth','aero','exhaust','lights'], row)) for row in REFERENCES}
CATALOG = [(p['id'],p['style'],p['wheelbase'],1,0,0,p['color']) for p in PROFILES.values()]


def font(size, italic=False):
    candidates = [Path('C:/Windows/Fonts') / ('arialbi.ttf' if italic else 'arialbd.ttf'),
                  Path('/usr/share/fonts/truetype/dejavu') / ('DejaVuSans-BoldOblique.ttf' if italic else 'DejaVuSans-Bold.ttf')]
    return ImageFont.truetype(str(next(path for path in candidates if path.exists())), size)


def factory_textures(output):
    """Transparent manufacturer lettering and edition-specific colour blocking."""
    palettes = {
        'factory':('#ffffff','#d0d2d4'), 'v4':('#11151c','#57c62b'),
        'silver':('#e12331','#ffffff'), 'corsa':('#ffffff','#b0b3b7'),
        'aero':('#ffffff','#163fb5'), 'endurance':('#d9dde2','#ffffff'),
        'sprint':('#bfa464','#d8dbdf'), 'titan':('#ffffff','#25282c'),
        'carbon':('#092443','#ffffff'), 'sakura':('#131719','#ffffff'),
        'bmw':('#124db7','#e72740'), 'rsv4':('#e82832','#ffffff'),
        'r1':('#131a32','#f0f0f0'), 'fireblade':('#ffffff','#183eb6'),
        'gsxr':('#cdd3dc','#ffffff'),
    }
    for style, p in PROFILES.items():
        im = Image.new('RGBA', (1024,512))
        draw = ImageDraw.Draw(im)
        accent, trim = palettes[style]
        draw.polygon([(0,400),(1024,170),(1024,512),(0,512)], fill=accent)
        draw.polygon([(0,410),(1024,180),(1024,204),(0,434)], fill=trim)
        if style in ('aero','fireblade','bmw'):
            draw.polygon([(550,512),(850,210),(1024,170),(850,512)], fill=trim)
        if style in ('sprint','silver','rsv4'):
            draw.line([(20,30),(1000,30)], fill=trim, width=7)
        # Model names fit their UV island; long names do not overflow.
        name_font = font(125, True)
        while draw.textbbox((0,0),p['brand'],font=name_font)[2] > 920:
            name_font = font(name_font.size-2, True)
        ink='#101923' if style=='bmw' else 'white'
        draw.text((45,65), p['brand'], font=name_font, fill=ink, stroke_width=1)
        model_font = font(47, True)
        while draw.textbbox((0,0),p['model'],font=model_font)[2] > 920:
            model_font = font(model_font.size-1, True)
        draw.text((50,238),p['model'],font=model_font,fill=ink)
        im.save(output / f'factory_{p["id"]}.png', optimize=True)


def bodywork(m, spec):
    p = PROFILES[spec[1]]
    style = p['style']
    front, rear = p['wheelbase']/2, -p['wheelbase']/2
    nw, nh, nose = p['noseWidth'], p['noseHeight'], p['noseLength']
    gp = p['lights'] is None
    angular = style in ('carbon','sakura','bmw','fireblade')
    accent = 'Accent'

    # Open side panels: the lower front edge rises around the wheel, rather
    # than enclosing the front tyre in the old ellipsoidal fairing.
    stations = [
        [-.47,.70,.37,.10],[-.31,.85,.31,.23],[-.04,.91,.29,.278],
        [.20,.94,.34,.291],[.43,nh,.61,nw*1.06],[.65,nh+.012,.88,nw],
        [nose-.08,nh+.004,nh-.16,nw*.98],[nose,nh-.012,nh-.15,nw*.70],
    ]
    if style in ('corsa','sprint','r1'):
        for section in stations[:4]: section[3] *= .92
    if style in ('silver','carbon'):
        stations[2][2] = .255
        stations[3][3] *= 1.045

    # Interpolate these engineering stations without importing the model module
    # (the authoring workshop imports this file).
    def sample(u):
        arr=np.asarray(stations)
        f=np.clip(u,0,1)*(len(arr)-1)
        i=np.minimum(len(arr)-2,np.floor(f).astype(int))
        a=(f-i)[...,None]
        b,c=arr[i],arr[i+1]
        before,after=arr[np.maximum(0,i-1)],arr[np.minimum(len(arr)-1,i+2)]
        return .5*(2*b+(-before+c)*a+(2*before-5*b+4*c-after)*a*a+(-before+3*b-3*c+after)*a*a*a)

    def panel(u,v,side=1,offset=0):
        q=sample(u)
        # A broad shoulder and a narrower belly pan; almost planar sides on
        # the KTM/Ninja versus curved panels on Suzuki and Ducati.
        bulge=(.72+.28*np.sin(v*math.pi*.87)) if not angular else (.77+.23*np.minimum(1,v*2.7))
        return np.stack([side*(q[...,3]*bulge+offset),q[...,2]+(q[...,1]-q[...,2])*v,q[...,0]],axis=-1)

    for side in (-1,1):
        m.surface('body',lambda u,v,side=side:panel(u,v,side),108,36,'Paint',side>0)
        m.surface('livery',lambda u,v,side=side:panel(.13+.41*(1-u if side>0 else u),.15+.71*v,side,.0018),56,24,'Livery',False)
        # Dark radiator outlet is a separate inset side panel, ending before
        # the outer shoulder instead of a set of protruding rounded tubes.
        m.surface('body',lambda u,v,side=side:panel(.55+.08*u,.36+.38*v,side,.0025),14,12,'Carbon',side>0)
        if style in ('corsa','titan','fireblade','sakura'):
            for j in range(2 if style=='corsa' else 3):
                m.surface('body',lambda u,v,side=side,j=j:panel(.55+j*.021+.007*u,.39+.31*v,side,.004),6,10,'Paint',side>0)
        # Twin spar/frame and rearsets remain visible through the open cockpit.
        frame='Carbon' if style=='carbon' else 'Aluminium'
        if style not in ('corsa','titan'):
            m.tube('body',[[side*.135,.94,.38],[side*.223,.80,.15],[side*.215,.57,-.34]],[[.025,.045],[.03,.052],[.027,.04]],frame,30,12)
        m.cylinder('body',[side*.23,.43,-.40],[side*.32,.43,-.40],.015,'Titanium',16)
        # A single-sided swingarm is a defining V4 R 2023 detail.
        if style!='titan' or side==-1:
            m.tube('body',[[side*.20,.52,-.30],[side*(.25 if style=='titan' else .19),.39,rear+.18],[side*.16,.326,rear]],[[.034,.055],[.033,.049],[.024,.03]],'DarkMetal',32,12)
        if gp:
            # Front brake cooling scoop, distinct from a headlight.
            m.ellipsoid('steering',[side*.153,.43,front-.055],[.037,.055,.065],'Carbon',24,14)

    # Belly pan does not bridge either wheel opening.
    m.loft('body',[[-.44,.36,.07,.025],[-.22,.307,.18,.025],[.16,.32,.19,.035],[.39,.44,.08,.025]],'Carbon',48,24)
    # The nose is a shallow, broad cowl with open cockpit behind it.
    exponent=.48 if angular else .82
    def cowl(u,v):
        theta=(u-.5)*math.pi
        width=nw*(1-.18*v)
        return np.stack([np.sign(np.sin(theta))*np.abs(np.sin(theta))**exponent*width,
                         nh+.018*np.cos(theta)-.03*v,
                         .63+(nose-.63)*v+.016*np.cos(theta)],axis=-1)
    m.surface('body',cowl,64,38,'Paint',True)
    def front_mask(u,v):
        x=(u-.5)*2*nw*.84
        return np.stack([x*(1-.12*v),nh+.018-.17*v+.012*(1-(x/(nw*.84))**2),
                         nose-.08*np.abs(x/(nw*.84))**1.7-.03*v],axis=-1)
    m.surface('body',front_mask,64,28,'Paint',True)
    # Real air inlet, in front of the cowl; different widths/aspects by edition.
    intake_width={'factory':.066,'v4':.081,'silver':.058,'aero':.058,'endurance':.073,
                  'carbon':.082,'r1':.062,'bmw':.046,'fireblade':.046,'corsa':.045,
                  'titan':.052,'sprint':.033,'sakura':.050,'rsv4':.035,'gsxr':.038}[style]
    if style not in ('gsxr','sprint','rsv4'):
        def inlet(u,v):
            a=u*TAU
            exponent=.48 if angular or style=='factory' else 1
            x=np.sign(np.cos(a))*np.abs(np.cos(a))**exponent*intake_width*v
            y=np.sign(np.sin(a))*np.abs(np.sin(a))**exponent*.026*v
            return np.stack([x,nh-.083+y,np.full_like(u,nose+.002)],axis=-1)
        m.surface('body',inlet,44,12,'Rubber',True)

    # Fuel tank and saddle keep ergonomic contact points compatible with the
    # shared rider; tank/codone proportions are edition-specific.
    tank_material='Aluminium' if style=='titan' else 'Paint'
    tw,th=p['tankWidth'],p['tankHeight']
    m.loft('body',[[-.45,.89,.03,.025],[-.30,.965,tw*.86,.075],[-.08,th-.075,tw,.077],[.13,.98,tw*.91,.09],[.32,.90,.07,.035]],tank_material,64,32)
    m.cylinder('body',[0,th-.001,-.07],[0,th+.003,-.07],.037,'DarkMetal',32)
    tail_height,tail_width=p['tailHeight'],p['tailWidth']
    m.loft('body',[[-1.035,tail_height,.006,.012],[-.94,tail_height+.002,tail_width*.64,.031],[-.78,tail_height-.027,tail_width,.047],[-.59,.90,.138,.032],[-.38,.887,.10,.017]],'Paint',64,24)
    m.loft('body',[[-.80,.946,.045,.009],[-.66,.932,.112,.017],[-.47,.920,.117,.019],[-.35,.906,.045,.01]],'Rubber',36,20)
    # Visible under-tail channel and, on the R1, its characteristic side slots.
    m.loft('body',[[-1.02,tail_height-.026,.015,.008],[-.85,tail_height-.055,tail_width*.7,.012],[-.65,.875,.10,.012]],'Carbon',36,16)
    if style in ('r1','factory','silver','carbon'):
        for side in (-1,1):
            m.tube('body',[[side*.06,tail_height+.018,-.96],[side*.13,tail_height-.014,-.79]],[.011,.009],accent if style=='r1' else 'Carbon',24,8)
    m.ellipsoid('body',[0,tail_height-.012,-1.035],[.035,.009,.005],'RedLight',22,12)

    # Smooth engine cases, cooling fins and a working chain line.
    m.ellipsoid('body',[0,.52,-.12],[.198,.18,.22],'DarkMetal',36,24)
    for side in (-1,1):
        m.cylinder('body',[side*.19,.48,-.15],[side*.224,.48,-.15],.098,'Titanium',36)
        for j in range(8):
            a=j*TAU/8
            m.cylinder('body',[side*.224,.48+math.cos(a)*.08,-.15+math.sin(a)*.08],[side*.23,.48+math.cos(a)*.08,-.15+math.sin(a)*.08],.0045,'Aluminium',8)
    m.surface('body',lambda u,v:np.stack([-.17+u*.34,.45+v*.32,np.full_like(u,.315)],axis=-1),20,20,'Rubber',False)
    for j in range(12):
        m.cylinder('body',[-.17,.47+j*.022,.32],[.17,.47+j*.022,.32],.0016,'DarkMetal',6)
    for upper in (-1,1):
        m.tube('body',[[-.20,.45+upper*.044,-.21],[-.20,.326+upper*.115,rear]],[.005,.005],'DarkMetal',24,6)
    m.cylinder('body',[-.21,.326,rear],[-.19,.326,rear],.116,'DarkMetal',40)

    # Steering, clip-ons and an arch-shaped front mudguard.
    for side in (-1,1):
        m.cylinder('steering',[side*.115,.312,front],[side*.115,.66,front-.12],.021,'Titanium',28)
        m.cylinder('steering',[side*.115,.59,front-.10],[side*.115,.97,front-.235],.025,'Gold',28)
        m.cylinder('steering',[side*.11,.955,front-.25],[side*.30,.97,front-.37],.014,'Titanium',20)
        m.cylinder('steering',[side*.27,.975,front-.36],[side*.35,.975,front-.40],.019,'Rubber',20)
        m.tube('steering',[[side*.29,.975,front-.35],[side*.37,.98,front-.31],[side*.38,.968,front-.37]],[.004,.004,.003],'Aluminium',18,8)
    m.cylinder('steering',[-.14,.955,front-.235],[.14,.955,front-.235],.021,'Aluminium',24)
    def fender(u,v):
        a=(v-.47)*2.25
        return np.stack([(u-.5)*.205,.312+(.354+.008*np.sin(u*math.pi))*np.cos(a),front+.355*np.sin(a)],axis=-1)
    m.surface('steering',fender,24,44,'Carbon' if gp else 'Paint',True)

    # Low double-curvature windscreen, with a tall central dome rather than
    # an opaque spherical canopy. The lowest edge meets the nose shoulder.
    screen_height=.205 if gp else .183
    if style in ('sakura','bmw'):screen_height+=.025
    def screen(u,v):
        a=(u-.5)*math.pi
        return np.stack([np.sin(a)*(nw*.88-.025*v),
                         nh+.02+np.cos(a)*(.018+screen_height*np.sin(v*math.pi/2)),
                         .76-.36*v],axis=-1)
    m.surface('glass',screen,52,28,'Glass',False)
    for side in (0,1):
        rim=[screen(np.array(side),np.array(t)).tolist() for t in np.linspace(0,1,7)]
        m.tube('body',rim,[.0025]*7,'Carbon',26,6)

    # Aerodynamics: exposed multi-element GP wings, enclosed production ducts,
    # or the wide BMW aerofoil. No wings on reference bikes that lack them.
    aero=p['aero']
    if aero!='none':
        if aero=='integrated':
            for side in (-1,1):
                m.loft('body',[[.26,.82,.018,.018],[.40,.87,.018,.048],[.57,.91,.018,.04],[.66,.94,.012,.008]],'Carbon',36,16)
                # Move each channel out to the shoulder and keep a painted cap.
                for name,mat,pos,normal,uv,faces in m.parts[-1:]:pos[:,0]+=side*(nw+.018)
                m.tube('body',[[side*(nw+.02),.85,.28],[side*(nw+.045),.91,.47],[side*(nw+.02),.945,.65]],[.012,.014,.01],'Paint',28,8)
        else:
            count=2 if aero in ('biplane','v4r','channels','ktm','rsv4') else 1
            span={'biplane':.45,'channels':.47,'ktm':.44,'bmw':.47,'m1':.415,'honda-gp':.42,'suzuki-gp':.39,'v4r':.395,'rsv4':.40}[aero]
            for side in (-1,1):
                for layer in range(count):
                    y=nh-.045-layer*.058
                    def wing(u,v,side=side,y=y):
                        return np.stack([side*(nw*.84+(span-nw*.84)*u),y-.026*u+.007*np.sin(v*TAU),.69+.12*np.cos(v*TAU)-.04*u],axis=-1)
                    m.surface('body',wing,22,16,'Carbon',side<0)
                m.tube('body',[[side*span,nh-.075,.54],[side*span,nh-.05,.73]],[.009,.009],'Carbon',18,8)
                if aero in ('biplane','channels','ktm'):
                    m.surface('body',lambda u,v,side=side:np.stack([np.full_like(u,side*span),nh-.11+u*.075,.55+v*.19],axis=-1),10,16,'Carbon',side<0)
            if aero in ('biplane','channels','ktm'):
                for side in (-1,1):
                    m.surface('body',lambda u,v,side=side:np.stack([side*(.27+.075*u),.52+.06*u+.008*np.sin(v*TAU),.04+.12*np.cos(v*TAU)],axis=-1),18,14,'Carbon',side<0)

    # Road-bike lights are modelled in the actual arrangements: twin slit,
    # three lamps, central GSX-R unit, or low circular R1 projectors.
    lights=p['lights']
    if lights:
        if lights=='single':
            m.ellipsoid('body',[0,nh-.071,nose+.014],[.048,.052,.008],'Lamp',32,20)
            for side in (-1,1):m.ellipsoid('body',[side*.14,nh-.06,nose-.026],[.054,.034,.010],'Rubber',28,16)
        elif lights=='r1':
            for side in (-1,1):
                m.ellipsoid('body',[side*.156,nh-.085,nose-.012],[.027,.027,.015],'Carbon',30,20)
                m.ellipsoid('body',[side*.156,nh-.085,nose+.004],[.019,.018,.006],'Lamp',30,20)
                m.tube('body',[[side*.074,nh-.021,nose+.006],[side*.182,nh-.004,nose-.034]],[.005,.004],'Lamp',24,8)
        else:
            for side in (-1,1):
                lamp_width=.067 if lights=='daytona' else .064 if lights=='bmw' else .070
                lamp_height=.029 if lights=='daytona' else .014
                def lamp(u,v,side=side,width=lamp_width,height=lamp_height,margin=0):
                    x=side*(.125+(u-.5)*2*(width+margin))
                    # The LED blade rises at the outer edge, following the
                    # actual cowl instead of floating circular lights in air.
                    y=nh-.055+.028*u+(v-.5)*2*(height+margin)*(np.sin(u*math.pi)*.45+.55)
                    z=nose-.08*np.abs(x/(nw*.84))**1.7-.03*((nh+.024-y)/.17)+.010-margin
                    return np.stack([x,y,z],axis=-1)
                m.surface('body',lambda u,v,side=side:lamp(u,v,side,margin=.006),28,12,'Rubber',side<0)
                m.surface('body',lamp,30,12,'Lamp',side<0)
            if lights=='triple':m.ellipsoid('body',[0,nh-.052,nose+.009],[.026,.019,.008],'Lamp',28,16)

    # Exhaust routing and volume remain visible from the chase camera.
    def silencer(start,end,radius=.05,material='Titanium'):
        a,b=np.array(start),np.array(end)
        m.tube('body',[a,b],[[radius,radius*.87],[radius*.91,radius*.79]],material,32,20)
        direction=(b-a)/np.linalg.norm(b-a)
        m.cylinder('body',b,b+direction*.012,radius*.82,'Carbon',30)
        m.cylinder('body',b+direction*.013,b+direction*.016,radius*.57,'Rubber',30)
    exhaust=p['exhaust']
    if exhaust=='underbelly':
        for side in (-1,1):
            silencer([side*.12,.29,.04],[side*.17,.30,-.44],.065)
    elif exhaust=='undertail-twin':
        for side in (-1,1):
            m.tube('body',[[side*.09,.31,-.12],[side*.17,.53,-.54],[side*.085,.83,-.83]],[.023,.024,.026],'Titanium',40,12)
            silencer([side*.073,.86,-.75],[side*.073,.886,-1.025],.036)
    else:
        m.tube('body',[[0,.31,.18],[.16,.28,-.12],[.235,.34,-.43]],[.03,.032,.032],'Titanium',40,16)
        long=exhaust in ('side-long','side-large')
        radius=.075 if exhaust=='side-large' else .058 if long else .045
        silencer([.25,.35,-.32 if long else -.53],[.30,.55 if long else .46,-.96 if long else -.88],radius,'Titanium' if long else 'Carbon')
        if exhaust=='gp-twin':
            m.tube('body',[[-.08,.33,-.2],[-.13,.66,-.63],[0,.88,-.85]],[.026,.027,.027],'Titanium',40,14)
            silencer([0,.91,-.82],[0,.92,-1.075],.041,'Carbon')

    # GP nose race-number island; production headlights remain unobstructed.
    if gp:
        m.surface('nose_number',lambda u,v:cowl(.34+(1-u)*.32,.22+(1-v)*.55)+[0,.003,0],28,24,'Number',True)
    return m
