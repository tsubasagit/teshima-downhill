# -*- coding: utf-8 -*-
"""正射写真から豊島の実測パレットを採る。出典: 国土地理院 シームレス空中写真"""
import json,math,sys,io
sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding='utf-8')
import numpy as np
from PIL import Image
M=json.load(open('ortho_meta.json')); Z=M['Z']; x0,y0=M['x0'],M['y0']
img=np.asarray(Image.open('ortho_raw.png').convert('RGB')).astype(np.float32)
N=2**Z
def px(lat,lon):
    r=math.radians(lat)
    X=(lon+180)/360*N; Y=(1-math.log(math.tan(r)+1/math.cos(r))/math.pi)/2*N
    return int((X-x0)*256), int((Y-y0)*256)
def patch(lat,lon,rad=6):
    x,y=px(lat,lon)
    a=img[max(0,y-rad):y+rad, max(0,x-rad):x+rad].reshape(-1,3)
    med=np.median(a,axis=0)
    return '#%02x%02x%02x'%tuple(int(v) for v in med), med

SAMPLES={
 '棚田(上部・草地)':      (34.48690,134.08880),
 '棚田(中腹・耕作地)':    (34.48800,134.09050),
 '棚田の畦(土手)':        (34.48745,134.08960),
 '照葉樹林(南斜面)':      (34.48450,134.09400),
 '照葉樹林(明部)':        (34.48620,134.09600),
 '海面(港内)':            (34.49080,134.09760),
 '海面(沖・唐櫃湾)':      (34.49250,134.09550),
 '海面(浅瀬・砂地際)':    (34.49010,134.09380),
 '砂浜':                  (34.49040,134.09300),
 '瓦屋根(唐櫃浜集落)':    (34.48900,134.09760),
 '瓦屋根(唐櫃岡集落)':    (34.48530,134.08760),
 '道路舗装':              (34.48630,134.08840),
 '防波堤・護岸':          (34.49150,134.09850),
}
print("■ 実写から採取した豊島の色（中央値）")
print("  用途                    HEX       RGB           彩度  明度")
import colorsys
out={}
for k,(la,lo) in SAMPLES.items():
    hx,med=patch(la,lo)
    h,l,s=colorsys.rgb_to_hls(*(med/255))
    out[k]={'hex':hx,'rgb':[int(v) for v in med],'sat':round(float(s),3),'light':round(float(l),3)}
    print(f"  {k:22s} {hx}  {str([int(v) for v in med]):16s} {s:.2f}  {l:.2f}")
json.dump(out,open('palette.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)

# ゲーム現行の色と比較
print("\n■ ゲーム現行との差")
game={'海(浅瀬)':'#1ec8ff','海(沖)':'#0aa0e6','草地':'#7ac943','空の水平線':'#5cb9f9'}
for k,v in game.items():
    r,g,b=int(v[1:3],16),int(v[3:5],16),int(v[5:7],16)
    h,l,s=colorsys.rgb_to_hls(r/255,g/255,b/255)
    print(f"  {k:12s} {v}  彩度{s:.2f} 明度{l:.2f}")
