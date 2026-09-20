# -*- coding: utf-8 -*-
import urllib.request, urllib.parse, json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
UA = {'User-Agent':'teshima-downhill-reference/1.0 (research)'}
def overpass(q):
    req = urllib.request.Request('https://overpass-api.de/api/interpreter',
        data=urllib.parse.urlencode({'data':q}).encode(), headers=UA)
    return json.load(urllib.request.urlopen(req, timeout=180))

# 唐櫃エリア（唐櫃岡 34.4866,134.0871 / 唐櫃浜 34.4879,134.0969）
BBOX = "34.4820,134.0820,34.4930,134.1020"
q = f"""
[out:json][timeout:120];
(
  way["highway"]({BBOX});
);
out geom tags;
"""
d = overpass(q)
print("way count:", len(d['elements']))
for e in d['elements']:
    t = e.get('tags',{})
    g = e.get('geometry',[])
    if not g: continue
    name = t.get('name','') or ''
    ref  = t.get('ref','') or ''
    print(f"id={e['id']} hw={t.get('highway')} ref={ref} name={name} nodes={len(g)} "
          f"start=({g[0]['lat']:.5f},{g[0]['lon']:.5f}) end=({g[-1]['lat']:.5f},{g[-1]['lon']:.5f})")
json.dump(d, open('karato_ways.json','w',encoding='utf-8'), ensure_ascii=False)
