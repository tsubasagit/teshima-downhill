"""assets-original/ の PNG を、Web 配信用に軽量化して assets/ へ書き出す。

- 不透明な画像 → JPEG（どのブラウザでも表示できる）
- 透過のある画像 → WebP（透過を保ったまま PNG の 1/4〜1/5 になる）
- タイル用（繰り返し表示）は 1024x1024 ちょうどにそろえる
  （2のべき乗にしておくと、three.js が実行時にリサイズしなくて済む）

使い方:  python tools/optimize_assets.py
"""
import os
import glob
from PIL import Image

SRC = "assets-original"
DST = "assets"

# くりかえして貼るタイル。2のべき乗の正方形にそろえる。
TILES = {
    "ground_fantasy_tile", "harbor_parking_tile", "road_asphalt_teshima",
    "road_stone_tile", "sea_surface_fantasy_v2", "sea_tile", "stone_wall_tile",
}
# 画面いっぱいに出るので、すこし大きめに残す
LARGE = {"sky_sea_panorama", "sky_fantasy"}
# ゲームで使っていない画像
SKIP = {"motion_system_infographic", "sky_clouds"}

TILE_SIZE = 1024
LARGE_MAX = 1536
DEFAULT_MAX = 1024
JPEG_QUALITY = 88
WEBP_QUALITY = 90


def has_alpha(im):
    return im.mode in ("RGBA", "LA") and im.getchannel("A").getextrema()[0] < 255


def main():
    total_before = total_after = 0
    rows = []
    for path in sorted(glob.glob(os.path.join(SRC, "*.png"))):
        stem = os.path.splitext(os.path.basename(path))[0]
        if stem in SKIP:
            continue
        im = Image.open(path)
        before = os.path.getsize(path)

        if stem in TILES:
            im = im.resize((TILE_SIZE, TILE_SIZE), Image.LANCZOS)
        else:
            im.thumbnail((LARGE_MAX, LARGE_MAX) if stem in LARGE
                         else (DEFAULT_MAX, DEFAULT_MAX), Image.LANCZOS)

        if has_alpha(im):
            out = os.path.join(DST, stem + ".webp")
            im.convert("RGBA").save(out, "WEBP", quality=WEBP_QUALITY,
                                    method=6, alpha_quality=100)
        else:
            out = os.path.join(DST, stem + ".jpg")
            im.convert("RGB").save(out, "JPEG", quality=JPEG_QUALITY,
                                   optimize=True, progressive=True)

        after = os.path.getsize(out)
        total_before += before
        total_after += after
        rows.append((os.path.basename(out), im.size, before, after))

    for name, size, before, after in rows:
        print(f"{name:34s} {size[0]:5d}x{size[1]:<5d} "
              f"{before/1048576:5.2f}MB -> {after/1024:6.0f}KB")
    print(f"\n合計 {total_before/1048576:.1f}MB -> {total_after/1048576:.1f}MB "
          f"({total_after/total_before*100:.0f}%)  画像 {len(rows)}枚")


if __name__ == "__main__":
    main()
