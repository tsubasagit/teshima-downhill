# -*- coding: utf-8 -*-
"""現地確認用ショットリスト（ストリートビューURL）を実測線形から生成"""
import json,math,sys,io
sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding='utf-8')
prof=json.load(open('karato_profile.json',encoding='utf-8'))['samples']
rows=json.load(open('karato_rows.json',encoding='utf-8'))
SHOTS=[(0,'唐櫃岡の集落を出る。家の密度と塀・石垣・電柱の見え方',0),
       (120,'集落を抜けきった直後。棚田の始まり',0),
       (230,'左ヘアピン 半径38m。ガードレールと山側の擁壁',0),
       (330,'「ため」区間。勾配1〜4%、正面に何が見えるか',0),
       (470,'再び急坂へ。9%台に入る瞬間',0),
       (620,'豊島美術館。海が正面に開く最重要ショット',0),
       (620,'同地点から海側（左手）を向いた景色',-75),
       (780,'棚田の中を横切る。畦と石積みの高さ',0),
       (900,'右90度カーブ 半径44m',0),
       (1150,'左77度 最急12.2%の区間',0),
       (1360,'唐櫃浜の集落に入る。家並みの様式',0),
       (1480,'港へ入る右82度。センターラインが消える',0),
       (1700,'唐櫃港。待合所・岸壁・フェリー',0),
       (1700,'港から沖（小豊島→小豆島の重なり）',20)]
print('| # | d | 標高 | 進行方位 | 見るもの | ストリートビュー |')
print('|---|---|---|---|---|---|')
for i,(dm,what,off) in enumerate(SHOTS,1):
    s=min(prof,key=lambda s:abs(s['d']-dm))
    r=min(rows,key=lambda r:abs(r['d']-dm))
    h=(r['br']+off)%360
    u=(f"https://www.google.com/maps/@?api=1&map_action=pano"
       f"&viewpoint={s['lat']:.6f},{s['lon']:.6f}&heading={h:.0f}&pitch=0&fov=90")
    print(f"| {i:02d} | {dm}m | {s['ele'] if s['ele'] else '-'}m | {h:.0f}° | {what} | [開く]({u}) |")
