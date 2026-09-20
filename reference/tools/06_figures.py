# -*- coding: utf-8 -*-
"""正本の図版を作る（PILのみ）"""
import json,math,sys,io
sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding='utf-8')
from PIL import Image,ImageDraw,ImageFont
F=lambda s: ImageFont.truetype(r'C:\Windows\Fonts\meiryo.ttc', s)
FB=lambda s: ImageFont.truetype(r'C:\Windows\Fonts\meiryob.ttc', s)

# ---------- 図1: 縦断図（標高・勾配）+ 平面の曲率 ----------
rows=json.load(open('karato_rows.json',encoding='utf-8'))
W,H=1900,900; im=Image.new('RGB',(W,H),(252,251,248)); d=ImageDraw.Draw(im)
L,R,T=110,W-60,70
d.text((L,20),'図1  唐櫃の坂 実測縦断図 — 香川県道255号 豊島循環線 唐櫃岡→唐櫃港',font=FB(30),fill=(20,40,60))
d.text((L,H-32),'標高: 国土地理院 標高API(5mレーザ) / 線形: OpenStreetMap  1780m を10m間隔で実測',font=F(17),fill=(110,110,110))
# 標高
gT,gH=T+20,300; maxE=110.0
d.rectangle([L,gT,R,gT+gH],outline=(200,205,210))
for e in range(0,111,20):
    y=gT+gH-e/maxE*gH
    d.line([L,y,R,y],fill=(232,234,236)); d.text((L-52,y-11),f'{e} m',font=F(16),fill=(120,120,120))
pts=[(L+(r['d']/1780)*(R-L), gT+gH-r['ele']/maxE*gH) for r in rows]
d.line(pts,fill=(30,90,150),width=4)
d.polygon(pts+[(R,gT+gH),(L,gT+gH)],fill=None)
# 勾配
sT,sH=gT+gH+80,220; maxG=14.0
d.rectangle([L,sT,R,sT+sH],outline=(200,205,210))
for g in range(0,15,2):
    y=sT+sH-g/maxG*sH
    d.line([L,y,R,y],fill=(238,236,232)); d.text((L-52,y-11),f'{g} %',font=F(16),fill=(120,120,120))
for r in rows:
    x=L+(r['d']/1780)*(R-L); g=max(0,min(maxG,r['grade']))
    col=(200,70,50) if r['grade']>=9 else (225,160,60) if r['grade']>=6 else (150,180,150)
    d.line([x,sT+sH,x,sT+sH-g/maxG*sH],fill=col,width=3)
d.text((L,sT-30),'区間勾配（赤=9%以上の急坂 / 橙=6〜9% / 緑=6%未満）',font=FB(19),fill=(60,60,60))
d.text((L,gT-30),'標高（最高104.8m → 港2.3m ／ 標高差102.5m）',font=FB(19),fill=(60,60,60))
# 曲率
cT,cH=sT+sH+80,150
d.line([L,cT+cH/2,R,cT+cH/2],fill=(200,205,210))
for r in rows:
    x=L+(r['d']/1780)*(R-L); t=max(-35,min(35,r['turn']))
    d.line([x,cT+cH/2,x,cT+cH/2-t/35*(cH/2)],fill=(60,120,90) if t>0 else (140,90,160),width=3)
d.text((L,cT-30),'平面曲率（上=右カーブ / 下=左カーブ・総回転907度）',font=FB(19),fill=(60,60,60))
# 距離目盛と地物
for dm in range(0,1801,200):
    x=L+(dm/1780)*(R-L)
    d.line([x,gT,x,cT+cH],fill=(224,226,228)); d.text((x-22,cT+cH+8),f'{dm}m',font=F(16),fill=(110,110,110))
MARK=[(0,'唐櫃岡集落・バス停'),(620,'豊島美術館'),(1360,'唐櫃浜集落'),(1590,'唐櫃港 待合')]
for dm,lab in MARK:
    x=L+(dm/1780)*(R-L)
    d.line([x,gT,x,cT+cH],fill=(210,80,60),width=2)
    d.text((x+6,gT+4),lab,font=FB(17),fill=(180,50,40))
im.save('fig1_profile.png'); print('fig1_profile.png')

# ---------- 図2: スカイライン ----------
sk=json.load(open('skyline.json',encoding='utf-8'))
W2,H2=1900,760; im2=Image.new('RGB',(W2,H2),(250,250,252)); d2=ImageDraw.Draw(im2)
d2.text((70,20),'図2  唐櫃の坂から見える実スカイライン — 方位ごとの尾根の仰角',font=FB(30),fill=(20,40,60))
d2.text((70,H2-30),'国土地理院 標高タイル(dem z=11)から視線計算。大気屈折 k=0.13 を考慮。距離26kmまで。',font=F(17),fill=(110,110,110))
L2,R2=90,W2-40; base=H2-110; scale=150.0
d2.line([L2,base,R2,base],fill=(90,110,130),width=3)
d2.text((L2-70,base-10),'水平',font=F(16),fill=(90,110,130))
for a in (1,2,3):
    y=base-a*scale/2
    d2.line([L2,y,R2,y],fill=(228,230,234)); d2.text((L2-60,y-10),f'{a}.0°',font=F(15),fill=(140,140,140))
COL={'A_坂上_唐櫃岡':(180,120,60),'B_中腹_眺望':(40,110,170),'C_港手前':(60,160,130)}
for key,col in COL.items():
    ln=[]
    for e in sk[key]:
        if e['br']>210: continue
        x=L2+(e['br']/210)*(R2-L2); y=base-max(-0.6,e['ang'])*scale/2
        ln.append((x,y))
    d2.line(ln,fill=col,width=3)
for br in range(0,211,15):
    x=L2+(br/210)*(R2-L2)
    d2.line([x,base-260,x,base+14],fill=(234,234,238)); d2.text((x-14,base+20),f'{br}°',font=F(15),fill=(110,110,110))
LAB=[(8,'児島半島（本州）21km'),(75,'小豆島 西端'),(84,'小豆島 星ヶ城山 810m 21km'),
     (100,'小豆島 南'),(118,'小豊島 2.8km'),(150,'豊島 自島の尾根'),(168,'壇山 328m 0.9km'),(196,'壇山 主稜')]
for br,lab in LAB:
    x=L2+(br/210)*(R2-L2)
    d2.line([x,base-250,x,base-30],fill=(215,215,222))
    tmp=Image.new('RGBA',(430,30),(0,0,0,0)); ImageDraw.Draw(tmp).text((0,0),lab,font=FB(19),fill=(50,60,80,255))
    im2.paste(tmp.rotate(90,expand=True),(int(x)-26,base-455),tmp.rotate(90,expand=True))
y0=118
for key,col in COL.items():
    d2.rectangle([W2-460,y0,W2-425,y0+8],fill=col)
    d2.text((W2-415,y0-8),{'A_坂上_唐櫃岡':'A 坂上 唐櫃岡 標高105m','B_中腹_眺望':'B 中腹 標高60m','C_港手前':'C 港手前 標高8m'}[key],font=F(19),fill=(60,60,60))
    y0+=30
im2.save('fig2_skyline.png'); print('fig2_skyline.png')
