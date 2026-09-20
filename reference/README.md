# reference — 唐櫃の坂の実測データ

[../参照正本_唐櫃の坂.md](../参照正本_唐櫃の坂.md) を支える、図版・生データ・取得スクリプト。

## 図版

| ファイル | 中身 |
|---|---|
| `fig1_profile.png` | 実測縦断図（標高・勾配・曲率）1,780m を10m間隔 |
| `fig2_skyline.png` | 方位別スカイライン。3地点から26km先まで |
| `fig3_corridor.jpg` | 空中写真に実線形と沿道の密度を重ねたもの |

## 生データ（`data/`）

| ファイル | 中身 |
|---|---|
| `karato_profile.json` | 10m間隔179点の緯度経度と標高 |
| `karato_rows.json` | 区間ごとの勾配・進行方位・曲率 |
| `skyline.json` | 0.5度刻み720点 × 3地点の尾根仰角・距離・標高 |
| `palette.json` | 空中写真から採った13色の実測値 |
| `course_derived.json` | 実測から自動生成した15区間 |
| `landcover.json` | 道路から120m以内の建物・施設 |
| `karato_ways.json` | OpenStreetMapの道路ジオメトリ（生） |
| `sight_items.json` | 周辺の島と山の方位・距離・標高 |

## スクリプト（`tools/`）

番号順に実行する。`py -3` と Pillow、numpy が要る。

```bash
py -3 00_osm_roads.py      # OpenStreetMapから道路線形
py -3 01_route_profile.py  # 国土地理院 標高APIで縦断（約4分）
py -3 02_skyline.py        # 標高タイルから視線計算
py -3 03_ortho.py          # 空中写真モザイク
py -3 04_palette.py        # 実測パレット
py -3 05_course.py         # COURSE配列を導出
py -3 06_figures.py        # 図1・図2
py -3 07_corridor.py       # 図3
py -3 08_shotlist.py       # ショットリスト
```

スクリプトは自分のフォルダを作業ディレクトリとして動く。
中間ファイル（`demtxt/` `ortho/` のタイルキャッシュ、`ortho_raw.png`）は
リポジトリに入れていないので、初回は取得に時間がかかる。

外部APIにはレート制限がある。失敗したら時間を置いて再実行すること。
空ファイルがキャッシュに残ると「陸地なのに海」と誤判定するので、
やり直すときは `find demtxt -type f -size 0 -delete` してから走らせる。

## 出典

- 道路線形・沿道の地物: OpenStreetMap contributors（ODbL）
- 標高・空中写真: 国土地理院（標高API／標高タイル／シームレス空中写真）

国土地理院のコンテンツを利用しています。
