# -*- coding: utf-8 -*-
"""唐櫃岡→唐櫃浜 県道255号 豊島循環線 の実測プロファイル
   道路線形: OpenStreetMap (ODbL) / 標高: 国土地理院 標高API"""
import json, math, time, urllib.request, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

ways = {w['id']: w for w in json.load(open('karato_ways.json', encoding='utf-8'))['elements']}

# 唐櫃岡(内陸・高) → 唐櫃浜(港・海抜0) の順に並べる
ROUTE = [(164582658, True), (164584307, True)]   # True = ジオメトリを反転

pts = []
for wid, rev in ROUTE:
    g = [(p['lat'], p['lon']) for p in ways[wid]['geometry']]
    if rev: g = g[::-1]
    if pts and abs(pts[-1][0]-g[0][0]) < 1e-6 and abs(pts[-1][1]-g[0][1]) < 1e-6:
        g = g[1:]
    pts += g

R = 6378137.0
def m_per_deg(lat):
    return (111132.92 - 559.82*math.cos(2*math.radians(lat)) + 1.175*math.cos(4*math.radians(lat)),
            111412.84*math.cos(math.radians(lat)) - 93.5*math.cos(3*math.radians(lat)))

lat0 = sum(p[0] for p in pts)/len(pts)
MLAT, MLON = m_per_deg(lat0)

# 等間隔（10m）にリサンプル
def dist(a, b):
    return math.hypot((b[0]-a[0])*MLAT, (b[1]-a[1])*MLON)

cum = [0.0]
for i in range(1, len(pts)):
    cum.append(cum[-1] + dist(pts[i-1], pts[i]))
total = cum[-1]
print(f"OSMノード数 {len(pts)} / 道なり距離 {total:.1f} m")
print(f"起点 唐櫃岡側 {pts[0][0]:.6f},{pts[0][1]:.6f}")
print(f"終点 唐櫃浜側 {pts[-1][0]:.6f},{pts[-1][1]:.6f}")

STEP = 10.0
samples = []
d = 0.0
j = 0
while d <= total:
    while j < len(cum)-2 and cum[j+1] < d: j += 1
    seg = cum[j+1]-cum[j]
    t = 0 if seg <= 0 else (d-cum[j])/seg
    la = pts[j][0] + (pts[j+1][0]-pts[j][0])*t
    lo = pts[j][1] + (pts[j+1][1]-pts[j][1])*t
    samples.append({'d': round(d,1), 'lat': round(la,7), 'lon': round(lo,7)})
    d += STEP
print(f"サンプル数 {len(samples)}（{STEP:.0f}m間隔）")

# 国土地理院 標高API
UA = {'User-Agent':'teshima-downhill-reference/1.0 (research)'}
def elev(lat, lon):
    u = f"https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php?lon={lon}&lat={lat}&outtype=JSON"
    for _ in range(3):
        try:
            r = json.load(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=25))
            e = r.get('elevation')
            return (None, r.get('hsrc')) if e in (None,'-----') else (float(e), r.get('hsrc'))
        except Exception:
            time.sleep(1.2)
    return (None, None)

for i, s in enumerate(samples):
    s['ele'], s['hsrc'] = elev(s['lat'], s['lon'])
    time.sleep(0.12)
    if i % 20 == 0: print(f"  標高取得 {i}/{len(samples)}", flush=True)

json.dump({'total': total, 'step': STEP, 'samples': samples},
          open('karato_profile.json','w',encoding='utf-8'), ensure_ascii=False, indent=1)
ok = [s for s in samples if s['ele'] is not None]
print(f"標高取得成功 {len(ok)}/{len(samples)}  出典={ok[0]['hsrc'] if ok else '-'}")
if ok:
    print(f"起点標高 {ok[0]['ele']} m / 終点標高 {ok[-1]['ele']} m / 標高差 {ok[0]['ele']-ok[-1]['ele']:.1f} m")
