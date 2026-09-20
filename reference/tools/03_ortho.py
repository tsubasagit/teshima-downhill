# -*- coding: utf-8 -*-
"""唐櫃の坂 走行区間の正射モザイク。出典: 国土地理院 シームレス空中写真"""
import urllib.request, urllib.error, math, os, time, json, sys, io
sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding='utf-8')
from PIL import Image, ImageDraw
UA={'User-Agent':'teshima-downhill-reference/1.0 (research)'}
os.makedirs('ortho',exist_ok=True)
Z=17; N=2**Z
def tx(lon): return (lon+180)/360*N
def ty(lat):
    r=math.radians(lat); return (1-math.log(math.tan(r)+1/math.cos(r))/math.pi)/2*N
LAT_N,LAT_S,LON_W,LON_E=34.4920,34.4835,134.0850,134.1000
x0,x1=int(tx(LON_W)),int(tx(LON_E)); y0,y1=int(ty(LAT_N)),int(ty(LAT_S))
nx,ny=x1-x0+1,y1-y0+1
print(f"z={Z} モザイク {nx}x{ny}={nx*ny}枚")
canvas=Image.new('RGB',(nx*256,ny*256),(160,180,190))
ok=0
for X in range(x0,x1+1):
    for Y in range(y0,y1+1):
        f=f'ortho/{Z}_{X}_{Y}.jpg'
        if not (os.path.exists(f) and os.path.getsize(f)>0):
            u=f'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{Z}/{X}/{Y}.jpg'
            for a in range(5):
                try:
                    b=urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=60).read()
                    open(f,'wb').write(b); break
                except urllib.error.HTTPError as e:
                    if e.code==404: open(f,'wb').write(b''); break
                    time.sleep(2*(a+1))
                except Exception: time.sleep(2*(a+1))
            time.sleep(0.35)
        if os.path.exists(f) and os.path.getsize(f)>0:
            canvas.paste(Image.open(f).convert('RGB'),((X-x0)*256,(Y-y0)*256)); ok+=1
print(f"貼付 {ok}/{nx*ny}")
canvas.save('ortho_raw.png')

# 実測ルートを重ねる
prof=json.load(open('karato_profile.json',encoding='utf-8'))['samples']
def px(lat,lon): return ((tx(lon)-x0)*256, (ty(lat)-y0)*256)
d=ImageDraw.Draw(canvas)
pts=[px(s['lat'],s['lon']) for s in prof]
d.line(pts,fill=(255,60,40),width=5)
for s in prof:
    if s['d']%200==0:
        x,y=px(s['lat'],s['lon'])
        d.ellipse([x-8,y-8,x+8,y+8],fill=(255,255,255),outline=(200,0,0),width=3)
        d.text((x+12,y-8),f"{s['d']:.0f}m {s['ele']:.0f}m" if s['ele'] else f"{s['d']:.0f}m",fill=(255,255,0))
canvas.save('ortho_route.png')
print(f"保存 ortho_route.png {canvas.size}")
json.dump({'Z':Z,'x0':x0,'y0':y0,'nx':nx,'ny':ny,
           'bbox':[LAT_S,LAT_N,LON_W,LON_E]},open('ortho_meta.json','w'))
