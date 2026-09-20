# -*- coding: utf-8 -*-
import json,math,sys,io
sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding='utf-8')
from PIL import Image,ImageDraw,ImageFont
F=lambda s: ImageFont.truetype(r'C:\Windows\Fonts\meiryo.ttc',s)
FB=lambda s: ImageFont.truetype(r'C:\Windows\Fonts\meiryob.ttc',s)
M=json.load(open('ortho_meta.json')); Z=M['Z']; x0,y0=M['x0'],M['y0']; N=2**Z
base=Image.open('ortho_raw.png').convert('RGB')
im=Image.new('RGB',(base.width,base.height+150),(255,255,255))
im.paste(base,(0,110)); d=ImageDraw.Draw(im)
def px(lat,lon):
    r=math.radians(lat)
    return ((lon+180)/360*N-x0)*256, ((1-math.log(math.tan(r)+1/math.cos(r))/math.pi)/2*N-y0)*256+110
prof=json.load(open('karato_profile.json',encoding='utf-8'))['samples']
pts=[px(s['lat'],s['lon']) for s in prof]
d.line(pts,fill=(255,255,255),width=11); d.line(pts,fill=(228,40,30),width=6)
d.text((40,26),'図3  走行区間の実位置と沿道の密度 — 唐櫃岡 → 唐櫃港 1780m',font=FB(38),fill=(20,40,60))
d.text((40,74),'背景: 国土地理院 シームレス空中写真 / 赤線: OpenStreetMap の県道255号 実線形',font=F(20),fill=(110,110,110))
MARK=[(0,'0m  唐櫃岡 集落  標高105m  ここまで家が密集',(1,-1)),
      (230,'230m  左ヘアピン 半径38m',(1,0)),
      (400,'400m  勾配1〜4%の「ため」 標高82m',(1,0)),
      (620,'620m  豊島美術館  正面に海が開く',(1,-1)),
      (900,'900m  右90度 半径44m  標高39m',(-1,1)),
      (1150,'1150m  左77度 半径37m  最急12.2%',(-1,1)),
      (1360,'1360m  唐櫃浜 集落に入る',(-1,-1)),
      (1480,'1480m  右82度 港へ 半径14m',(1,1)),
      (1780,'1780m  唐櫃港  標高2.3m',(-1,1))]
for dm,lab,(sx,sy) in MARK:
    s=min(prof,key=lambda s:abs(s['d']-dm)); x,y=px(s['lat'],s['lon'])
    d.ellipse([x-13,y-13,x+13,y+13],fill=(255,255,255),outline=(210,30,25),width=5)
    tw=d.textlength(lab,font=FB(21))
    tx=x+26*sx-(tw+18 if sx<0 else 0); ty=y+26*sy-(14 if sy<0 else 0)
    d.rectangle([tx-9,ty-7,tx+tw+9,ty+31],fill=(255,255,255))
    d.rectangle([tx-9,ty-7,tx+tw+9,ty+31],outline=(210,30,25),width=2)
    d.text((tx,ty),lab,font=FB(21),fill=(30,40,55))
# 密度帯
d.text((40,im.height-34),'沿道の密度: 0〜10m 集落20棟  →  10〜540m 無人（棚田と斜面のみ）  →  '
       '540〜620m 豊島美術館  →  620〜1360m 無人  →  1360m〜 集落と港',font=FB(23),fill=(30,60,90))
im.convert('RGB').save('fig3_corridor.jpg','JPEG',quality=84,optimize=True,progressive=True); print('fig3_corridor.jpg',im.size)
