"""SNS でシェアされたときに出るサムネイル（OGP画像）をつくる。

ゲームの素材をそのまま使って 1200x630 の1枚に合成する。
使い方:  python tools/make_ogp.py
"""
import os
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
OUT = "ogp.png"
FONT_BOLD = "C:/Windows/Fonts/meiryob.ttc"
FONT_REG = "C:/Windows/Fonts/meiryo.ttc"


def font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


def main():
    # 空（ゲームで使っているパノラマの上半分を引きのばす）
    sky = Image.open("assets/sky_sea_panorama.jpg").convert("RGB")
    sky = sky.resize((W, int(W * sky.height / sky.width)), Image.LANCZOS)
    base = Image.new("RGB", (W, H))
    base.paste(sky, (0, -int(sky.height * 0.18)))

    d = ImageDraw.Draw(base, "RGBA")
    horizon = int(H * 0.46)

    # 対岸の山なみ（遠いほど空の色に近づける）
    for x, w, h, c in [(-60, 460, 58, (128, 168, 192)), (280, 540, 46, (146, 182, 204)),
                       (720, 600, 66, (120, 160, 188))]:
        d.polygon([(x, horizon), (x + w // 2, horizon - h), (x + w, horizon)], fill=c)

    # 瀬戸内海。水平線から手前へ、しっかり見える帯にする
    sea_bottom = horizon + 96
    d.rectangle([0, horizon, W, sea_bottom], fill=(28, 134, 200))
    d.rectangle([0, sea_bottom - 34, W, sea_bottom], fill=(47, 201, 194))

    # 手前の斜面と道路（走っている画面に見えるように台形で）
    d.polygon([(0, H), (0, sea_bottom), (W, sea_bottom), (W, H)], fill=(92, 158, 74))
    road = [(W * 0.42, sea_bottom), (W * 0.58, sea_bottom), (W * 1.04, H), (W * -0.04, H)]
    d.polygon(road, fill=(96, 102, 106))
    # センターライン
    span = H - sea_bottom
    for i in range(5):
        t0, t1 = i / 5, i / 5 + 0.11
        y0, y1 = sea_bottom + span * t0, sea_bottom + span * t1
        hw0, hw1 = 2 + 12 * t0, 2 + 12 * t1
        d.polygon([(W / 2 - hw0, y0), (W / 2 + hw0, y0),
                   (W / 2 + hw1, y1), (W / 2 - hw1, y1)], fill=(240, 238, 226))

    # スケーター（下で切れないように余白をとる）
    sk = Image.open("assets/skater_back.webp").convert("RGBA")
    sk_h = int(H * 0.52)
    sk = sk.resize((int(sk.width * sk_h / sk.height), sk_h), Image.LANCZOS)
    base.paste(sk, (int(W * 0.62), H - sk_h - 24), sk)

    # 左下に文字がのる帯（読みやすさのため）
    d.rectangle([0, H - 250, int(W * 0.62), H], fill=(6, 34, 52, 165))

    d.text((54, H - 214), "豊島ダウンヒル", font=font(FONT_BOLD, 68), fill=(255, 255, 255))
    d.text((58, H - 126), "香川県・豊島の坂道をスケボーで駆け下りる",
           font=font(FONT_REG, 27), fill=(214, 236, 246))
    d.text((58, H - 86), "CoderDojo 稲城 ｜ ブラウザですぐ遊べます",
           font=font(FONT_BOLD, 27), fill=(246, 205, 66))

    base.save(OUT, "PNG", optimize=True)
    print(f"{OUT}  {os.path.getsize(OUT)/1024:.0f}KB  {W}x{H}")


if __name__ == "__main__":
    main()
