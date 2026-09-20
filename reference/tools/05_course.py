# -*- coding: utf-8 -*-
"""実測プロファイルから game.js の COURSE 配列を導出する（1ユニット=1m）
   カーブのきつさを鈍らせないため、曲率の大きい所は細かく刻む。"""
import json,math,sys,io
sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding='utf-8')
rows=json.load(open('karato_rows.json',encoding='utf-8'))
TOL_T, TOL_G = 0.38, 0.040      # 度/m, 勾配
segs=[]; cur=None
for r in rows:
    tpm=r['turn']/10.0; g=r['grade']/100.0
    # 曲率が大きいほど区間を短く保つ
    cap = 80 if abs(tpm)>1.2 else (150 if abs(tpm)>0.5 else 280)
    if cur and abs(tpm-cur['tpm'])<TOL_T and abs(g-cur['g'])<TOL_G and cur['len']<cap:
        n=cur['n']+1
        cur['tpm']=(cur['tpm']*cur['n']+tpm)/n; cur['g']=(cur['g']*cur['n']+g)/n
        cur['n']=n; cur['len']+=10; cur['end']=r['d']+10
    else:
        if cur: segs.append(cur)
        cur={'start':r['d'],'end':r['d']+10,'len':10,'tpm':tpm,'g':g,'n':1}
if cur: segs.append(cur)
# 10m単独区間だけ隣へ寄せる（曲率が近い側へ）
out=[]
for s in segs:
    if out and s['len']<=10 and abs(s['tpm']-out[-1]['tpm'])<0.9:
        m=out[-1]; t=m['len']+s['len']
        m['tpm']=(m['tpm']*m['len']+s['tpm']*s['len'])/t
        m['g']=(m['g']*m['len']+s['g']*s['len'])/t
        m['len']=t; m['end']=s['end']
    else: out.append(dict(s))
segs=out
tot=sum(s['len'] for s in segs)
turn=sum(abs(s['tpm']*s['len']) for s in segs)
net=sum(s['tpm']*s['len'] for s in segs)
drop=sum(s['g']*s['len'] for s in segs)
rad=[1/math.radians(abs(s['tpm'])) for s in segs if abs(s['tpm'])>0.05]
print(f"区間数 {len(segs)} / 総延長 {tot} m（実測1780）")
print(f"総回転 {turn:.0f} 度（実測907）/ 正味 {net:+.0f} 度（実測+42）")
print(f"標高差 {drop:.1f} m（実測102.5）")
print(f"カーブ半径 {min(rad):.0f} 〜 {max(rad):.0f} m（実測 最小14m）\n")
NOTE={0:'唐櫃岡の集落を抜ける',330:'★ため（ほぼ平ら）',470:'★どん（一気に落ちる）',
      620:'豊島美術館・海が開く',900:'右90度 半径44m',1010:'★2度目のため',
      1150:'最急12.2%',1360:'唐櫃浜の集落に入る',1480:'港へ入る右82度',1590:'唐櫃港 待合所'}
BIGSTARTS=[200,510,680,870,1000,1130,1470]   # 実測の大カーブ開始位置
print('const COURSE = [')
for s in segs:
    c=s['tpm']*s['len']; L=int(round(s['len'])); g=round(s['g'],3)
    note=next((t for d0,t in NOTE.items() if s['start']<=d0<s['end']),'')
    # 実測の大カーブ7箇所につき、その先頭区間だけ標識を立てる
    #（細分化で個々の区間角度は小さいので、角度では判定しない）
    big=', bigCurve: true' if any(s['start']<=b0<s['end'] for b0 in BIGSTARTS) else ''
    print(f"  {{ curve: {c:>5.0f}, length: {L:>4d}, slope: {g:6.3f}{big} }},"
          + (f"  // {note}" if note else ''))
print(f'];  // 合計 {tot} ユニット / 総回転 {turn:.0f}度')
json.dump(segs,open('course_derived.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
