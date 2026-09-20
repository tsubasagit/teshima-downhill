# -*- coding: utf-8 -*-
"""唐櫃の坂から見える実スカイライン（タイル逆引き方式）
   出典: 国土地理院 標高タイル dem z=11 / 道路線形: OpenStreetMap"""
import math, json, sys, io, os, glob
sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding='utf-8')
import numpy as np
Z=11; N=2**Z
TILES={}
for f in glob.glob(f'demtxt/{Z}_*.txt'):
    if os.path.getsize(f)==0: continue
    _,x,y=os.path.basename(f)[:-4].split('_')
    TILES[(int(x),int(y))]=np.array(
        [[np.nan if v=='e' else float(v) for v in ln.split(',')]
         for ln in open(f).read().strip().split('\n')],dtype=np.float32)
print(f"読込タイル {len(TILES)} 枚")
def elev(lat,lon):
    wx=(lon+180)/360*N
    r=math.radians(lat)
    wy=(1-math.log(math.tan(r)+1/math.cos(r))/math.pi)/2*N
    t=TILES.get((int(wx),int(wy)))
    if t is None: return 0.0
    px=int((wx-int(wx))*256); py=int((wy-int(wy))*256)
    v=t[py,px]
    return 0.0 if not np.isfinite(v) else float(v)

print("■ 検算")
for n,la,lo,real in [('壇山(豊島)',34.48167,134.07795,340),('星ヶ城山(小豆島)',34.5069,134.3175,816),
                     ('皇踏山(小豆島西)',34.4917,134.1861,394),('王頭山(直島)',34.4442,133.9950,213),
                     ('唐櫃岡の道',34.485793,134.088140,105),('小豊島',34.47618,134.11934,133),
                     ('唐櫃港',34.48923,134.09748,2)]:
    print(f"  {n:18s} DEM {elev(la,lo):6.1f} m / 実際 約{real} m")

R_EFF=6371000.0/(1-0.13); MLAT,MLON=110943.0,91700.0
def skyline(vlat,vlon,veye,step=0.5,maxkm=26.0):
    out=[]; b=0.0
    while b<360:
        rad=math.radians(b); best=-9.0; bd=0.0; bh=0.0
        d=150.0
        while d<maxkm*1000:
            h=elev(vlat+(d*math.cos(rad))/MLAT, vlon+(d*math.sin(rad))/MLON)
            if h>0.5:
                ang=math.degrees(math.atan2(h-veye-(d*d)/(2*R_EFF),d))
                if ang>best: best,bd,bh=ang,d,h
            d+= 35.0 if d<5000 else 100.0
        out.append({'br':round(b,1),'ang':round(best,3),'km':round(bd/1000,2),'ele':round(bh,1)})
        b+=step
    return out
VIEWS={'A_坂上_唐櫃岡':(34.485793,134.088140,106.4),
       'B_中腹_眺望':(34.48800,134.09300,61.6),
       'C_港手前':(34.48950,134.09600,9.6)}
res={k:skyline(*v) for k,v in VIEWS.items()}
json.dump(res,open('skyline.json','w',encoding='utf-8'),ensure_ascii=False)
print("\n保存 skyline.json")
