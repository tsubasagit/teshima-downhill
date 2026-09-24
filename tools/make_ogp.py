"""SNS でシェアされたときに出るサムネイル（OGP画像）をつくる。

実際のゲーム画面（docs/images/ogp-scene.jpg、1200x630）に、題名の帯を重ねる。
ゲーム画面は、ブラウザで走行中の 1 コマを 1200x630 で描き出したもの。
使い方:  python tools/make_ogp.py
"""
import os
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
SCENE = "docs/images/ogp-scene.jpg"
OUT = "ogp.png"
FONT_BOLD = "C:/Windows/Fonts/meiryob.ttc"
FONT_REG = "C:/Windows/Fonts/meiryo.ttc"


def font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


def main():
    base = Image.open(SCENE).convert("RGB").resize((W, H), Image.LANCZOS)
    band = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(band)
    # 左下に文字がのる帯（読みやすさのため）。右がわのスケーターにはかけない。
    d.rounded_rectangle([28, H - 238, 660, H - 28], radius=18, fill=(6, 34, 52, 178))
    base = Image.alpha_composite(base.convert("RGBA"), band)

    d = ImageDraw.Draw(base)
    d.text((62, H - 214), "豊島ダウンヒル", font=font(FONT_BOLD, 66), fill=(255, 255, 255))
    d.text((64, H - 128), "香川県・豊島の坂道をスケボーで駆け下りる",
           font=font(FONT_REG, 26), fill=(214, 236, 246))
    d.text((64, H - 88), "CoderDojo 稲城 ｜ ブラウザですぐ遊べます",
           font=font(FONT_BOLD, 26), fill=(246, 205, 66))

    base.convert("RGB").save(OUT, "PNG", optimize=True)
    print(f"{OUT}  {os.path.getsize(OUT)/1024:.0f}KB  {W}x{H}")


if __name__ == "__main__":
    main()
