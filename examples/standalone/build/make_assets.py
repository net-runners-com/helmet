"""Build server-only assets: decoy fonts + mapping tables, and watermarked images.

Outputs (all bundled into the Worker, never served as static files):
  src/generated/fonts/v{n}.woff2  decoy font variant n (cmap: fake codepoint -> real glyph)
  src/generated/maps.json         {n: {real_char: fake_char}}
  src/generated/img/*.jpg         images with an invisible DWT-DCT-SVD watermark
"""
import json
import random
import secrets
from pathlib import Path

import cv2
import numpy as np
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from imwatermark import WatermarkDecoder, WatermarkEncoder
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content" / "content.json"
SRC_FONT = ROOT / "assets-src" / "fonts" / "NotoSansJP-VF.ttf"
OUT = ROOT / "src" / "generated"
VARIANTS = 8
WATERMARK = b"HLMT2026"  # 64 bits, recover with build/verify_watermark.py
POOL = list(range(0x4E00, 0x9FA6))  # fake codepoints look like ordinary kanji


def collect_chars(content):
    chars = set()
    for b in content["blocks"]:
        for key in ("text", "label", "value"):
            if key in b:
                chars.update(b[key])
    chars.discard("\n")
    return sorted(chars)


def base_font(chars):
    font = TTFont(SRC_FONT)
    font = instancer.instantiateVariableFont(font, {"wght": 500})
    opts = subset.Options()
    opts.glyph_names = False
    opts.name_IDs = []
    opts.notdef_outline = True
    opts.layout_features = ["kern", "palt"]
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=[ord(c) for c in chars])
    sub.subset(font)
    return font


def jitter_outlines(font, rng):
    # Break exact glyph-hash matching across variants; +-2 units at 1000 upm is invisible.
    glyf = font["glyf"]
    for name in font.getGlyphOrder():
        g = glyf[name]
        if g.isComposite() or g.numberOfContours <= 0:
            continue
        for i, (x, y) in enumerate(g.coordinates):
            g.coordinates[i] = (x + rng.randint(-2, 2), y + rng.randint(-2, 2))
        g.recalcBounds(glyf)


def make_variant(chars, n):
    rng = random.Random(secrets.randbits(64))
    font = base_font(chars)
    cmap = font.getBestCmap()
    fakes = rng.sample(POOL, len(chars))
    mapping = {c: chr(f) for c, f in zip(chars, fakes)}
    new_cmap = {ord(mapping[c]): cmap[ord(c)] for c in chars if ord(c) in cmap}
    for table in font["cmap"].tables:
        if table.isUnicode():
            table.cmap = dict(new_cmap)
    font["post"].formatType = 3.0
    for rec in font["name"].names:
        if rec.nameID in (1, 4, 6, 16):
            rec.string = f"HD{n}"
    jitter_outlines(font, rng)
    font.flavor = "woff2"
    (OUT / "fonts").mkdir(parents=True, exist_ok=True)
    font.save(OUT / "fonts" / f"v{n}.woff2")
    return mapping


def make_hero(path):
    w, h = 1200, 600
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        for x in range(w):
            px[x, y] = (int(20 + 60 * x / w), int(30 + 40 * y / h), int(80 + 120 * (1 - x / w)))
    d = ImageDraw.Draw(img)
    rng = random.Random(7)
    for _ in range(40):
        r = rng.randint(20, 140)
        cx, cy = rng.randint(0, w), rng.randint(0, h)
        d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=(255, 255, 255), width=2)
    img = img.filter(ImageFilter.GaussianBlur(1.2))
    img.save(path)


def watermark(src, dst):
    bgr = cv2.imread(str(src))
    enc = WatermarkEncoder()
    enc.set_watermark("bytes", WATERMARK)
    out = enc.encode(bgr, "dwtDctSvd")
    cv2.imwrite(str(dst), out, [cv2.IMWRITE_JPEG_QUALITY, 92])
    dec = WatermarkDecoder("bytes", len(WATERMARK) * 8)
    got = dec.decode(cv2.imread(str(dst)), "dwtDctSvd")
    diff = np.abs(out.astype(int) - bgr.astype(int)).mean()
    print(f"watermark {dst.name}: embedded={WATERMARK!r} decoded={got!r} mean_abs_diff={diff:.2f}")
    if got != WATERMARK:
        raise SystemExit("watermark verification failed")


def main():
    content = json.loads(CONTENT.read_text())
    chars = collect_chars(content)
    maps = {str(n): make_variant(chars, n) for n in range(VARIANTS)}
    (OUT / "maps.json").write_text(json.dumps(maps, ensure_ascii=False))
    sizes = [(OUT / "fonts" / f"v{n}.woff2").stat().st_size for n in range(VARIANTS)]
    print(f"{len(chars)} chars, {VARIANTS} decoy fonts, {min(sizes)}-{max(sizes)} bytes each")

    (OUT / "img").mkdir(parents=True, exist_ok=True)
    raw = ROOT / "assets-src" / "hero.png"
    if not raw.exists():
        make_hero(raw)
    watermark(raw, OUT / "img" / "hero.jpg")


if __name__ == "__main__":
    main()
