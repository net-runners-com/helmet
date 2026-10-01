"""Helmet asset pipeline: build per-session decoy fonts and watermarked media.

Driven by a JSON config (see examples/standalone and the README). Outputs:
  <protected>/fonts/<v>/<faceKey>.woff2   decoy fonts (cmap: fake codepoint -> real glyph)
  <protected>/frames/p_NN.bin             packs of watermarked frames (optional)
  <work>/maps.json                        {v: {realChar: [fakeChar, ...]}} (server-only)
  <public>/fonts/loader.woff2             public subset for the pre-session loader (optional)

usage: python helmet_assets.py helmet.assets.json
Run under a venv with: fonttools brotli numpy opencv-python-headless invisible-watermark
"""
import json
import random
import secrets
import shutil
import struct
import sys
import unicodedata
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

# Fake codepoints: Latin-script letters, so an encoded run shapes as one Latin run
# (kerning and line-breaking behave as with the real text).
POOL = [
    cp
    for a, b in ((0x0100, 0x024F), (0x0250, 0x02AF), (0x1E00, 0x1EFF), (0x2C60, 0x2C7F), (0xA722, 0xA787))
    for cp in range(a, b + 1)
    if unicodedata.category(chr(cp)).startswith("L") and unicodedata.normalize("NFC", chr(cp)) == chr(cp)
]


def subset_font(path, text, features=("*",)):
    font = TTFont(path)
    opts = subset.Options()
    opts.glyph_names = False
    opts.name_IDs = []
    opts.notdef_outline = True
    opts.layout_features = list(features)
    sub = subset.Subsetter(opts)
    sub.populate(text=text)
    sub.subset(font)
    return font


def jitter(font, rng):
    # Break exact glyph-hash matching between variants; ~0.2% of the em is invisible.
    d = max(1, font["head"].unitsPerEm // 500)
    glyf = font["glyf"]
    for name in font.getGlyphOrder():
        g = glyf[name]
        if g.isComposite() or g.numberOfContours <= 0:
            continue
        for i, (x, y) in enumerate(g.coordinates):
            g.coordinates[i] = (x + rng.randint(-d, d), y + rng.randint(-d, d))
        g.recalcBounds(glyf)


def build_fonts(cfg, rendered, out_fonts, work):
    src = Path(cfg["fontsSrc"])
    faces = cfg["faces"]
    variants = cfg.get("variants", 8)
    max_hom = cfg.get("homophones", 10)
    live = cfg.get("live", "0123456789 ")

    chars = sorted(set("".join(rendered.values())) - {" "})
    covered = [set(TTFont(src / f["file"]).getBestCmap()) for f in faces.values()]
    encodable = [c for c in chars if all(ord(c) in cm for cm in covered)]
    skipped = [c for c in chars if c not in encodable]
    if not encodable:
        raise SystemExit("helmet: no encodable characters (check font coverage)")
    homophones = max(1, min(max_hom, len(POOL) // len(encodable)))

    maps = {}
    for v in range(variants):
        rng = random.Random(secrets.randbits(64))
        fakes = rng.sample(POOL, homophones * len(encodable))
        mapping = {c: [chr(f) for f in fakes[i * homophones:(i + 1) * homophones]] for i, c in enumerate(encodable)}
        maps[str(v)] = mapping
        vd = out_fonts / str(v)
        vd.mkdir(parents=True, exist_ok=True)
        for key, face in faces.items():
            font = subset_font(src / face["file"], "".join(encodable) + live)
            real = font.getBestCmap()
            cmap = {ord(c): real[ord(c)] for c in live if ord(c) in real}
            for c, fs in mapping.items():
                for f in fs:
                    cmap[ord(f)] = real[ord(c)]
            for table in font["cmap"].tables:
                if table.isUnicode():
                    table.cmap = dict(cmap)
            font["post"].formatType = 3.0
            jitter(font, rng)
            font.flavor = "woff2"
            font.save(vd / f"{key}.woff2")

    (work / "maps.json").write_text(json.dumps(maps, ensure_ascii=False))
    size = sum(p.stat().st_size for p in out_fonts.rglob("*.woff2"))
    print(f"fonts: {len(encodable)} chars x {homophones} homophones, {variants} variants x {len(faces)} files, {size // 1024} KiB")
    if skipped:
        print(f"fonts: left unencoded (missing from a source font): {''.join(skipped)!r}")


def build_loader(cfg, out_public):
    loader = cfg.get("loader")
    if not loader:
        return
    face = cfg["faces"][loader["face"]] if loader.get("face") in cfg["faces"] else {"file": loader["file"]}
    font = subset_font(Path(cfg["fontsSrc"]) / face["file"], loader.get("text", "0123456789%"))
    font.flavor = "woff2"
    out_public.mkdir(parents=True, exist_ok=True)
    font.save(out_public / "loader.woff2")
    print(f"loader: subset -> {out_public / 'loader.woff2'}")


def build_frames(cfg, out_frames, work):
    fr = cfg.get("frames")
    if not fr:
        return
    import cv2  # local import so font-only builds don't need opencv
    from imwatermark import WatermarkDecoder, WatermarkEncoder

    src_dir = Path(fr["dir"])
    pack = fr.get("pack", 8)
    mark = fr["watermark"].encode() if isinstance(fr["watermark"], str) else bytes(fr["watermark"])
    quality = fr.get("quality", 82)
    cache = work / "frames"
    cache.mkdir(parents=True, exist_ok=True)
    out_frames.mkdir(parents=True, exist_ok=True)

    enc = WatermarkEncoder()
    enc.set_watermark("bytes", mark)
    frames = sorted(src_dir.glob(fr.get("glob", "*.jpg")))
    made = 0
    for s in frames:
        d = cache / s.name
        if not d.exists() or d.stat().st_mtime < s.stat().st_mtime:
            cv2.imwrite(str(d), enc.encode(cv2.imread(str(s)), "dwtDctSvd"), [cv2.IMWRITE_JPEG_QUALITY, quality])
            made += 1
    for old in out_frames.glob("*.bin"):
        old.unlink()
    for p in range(0, len(frames), pack):
        blobs = [(cache / f.name).read_bytes() for f in frames[p:p + pack]]
        head = struct.pack(f"<I{len(blobs)}I", len(blobs), *map(len, blobs))
        (out_frames / f"p_{p // pack:02d}.bin").write_bytes(head + b"".join(blobs))

    dec = WatermarkDecoder("bytes", len(mark) * 8)
    got = [dec.decode(cv2.imread(str(cache / f.name)), "dwtDctSvd") for f in frames[::max(1, pack)]]
    vote = bytes(
        sum((sum(((g[n] >> i) & 1) for g in got) * 2 > len(got)) << i for i in range(8))
        for n in range(len(mark))
    ) if got else b""
    size = sum(p.stat().st_size for p in out_frames.glob("*.bin"))
    print(f"frames: {len(frames)} in {len(list(out_frames.glob('*.bin')))} packs ({made} re-watermarked), {size // 1024} KiB, majority-vote {vote!r}")
    if got and vote != mark:
        raise SystemExit("helmet: frame watermark verification failed")


def build_images(cfg, out_protected):
    im = cfg.get("images")
    if not im:
        return
    import cv2
    from imwatermark import WatermarkDecoder, WatermarkEncoder

    src_dir = Path(im["dir"])
    mark = im["watermark"].encode() if isinstance(im["watermark"], str) else bytes(im["watermark"])
    quality = im.get("quality", 90)
    out = out_protected / im.get("out", "img")
    out.mkdir(parents=True, exist_ok=True)
    enc = WatermarkEncoder()
    enc.set_watermark("bytes", mark)
    dec = WatermarkDecoder("bytes", len(mark) * 8)
    for s in sorted(src_dir.glob(im.get("glob", "*"))):
        if s.suffix.lower() not in (".jpg", ".jpeg", ".png"):
            continue
        dst = out / (s.stem + ".jpg")
        marked = enc.encode(cv2.imread(str(s)), "dwtDctSvd")
        cv2.imwrite(str(dst), marked, [cv2.IMWRITE_JPEG_QUALITY, quality])
        ok = dec.decode(cv2.imread(str(dst)), "dwtDctSvd") == mark
        print(f"image: {s.name} -> {dst.name}, watermark decode {ok}")


def build_protected_copy(cfg, out_protected):
    # Copy arbitrary static dirs into the protected path (served signed + masked),
    # e.g. Lottie JSON or any asset the client fetches through the session.
    for entry in cfg.get("protectedCopy", []):
        src = Path(entry["from"])
        dst = out_protected / entry.get("to", src.name)
        dst.mkdir(parents=True, exist_ok=True)
        n = 0
        for f in src.glob(entry.get("glob", "*")):
            if f.is_file():
                shutil.copyfile(f, dst / f.name)
                n += 1
        print(f"protected copy: {n} files {src} -> {dst}")


def main(cfg_path):
    cfg = json.loads(Path(cfg_path).read_text())
    work = Path(cfg["out"]["work"])
    work.mkdir(parents=True, exist_ok=True)
    out_protected = Path(cfg["out"]["protected"])
    out_public = Path(cfg["out"]["public"])

    rendered = cfg["rendered"] if "rendered" in cfg else json.loads(Path(cfg["renderedPath"]).read_text())
    build_fonts(cfg, rendered, out_protected / "fonts", work)
    build_loader(cfg, out_public / "fonts")
    build_frames(cfg, out_protected / "frames", work)
    build_images(cfg, out_protected)
    build_protected_copy(cfg, out_protected)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "helmet.assets.json")
