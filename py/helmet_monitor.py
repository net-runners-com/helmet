"""Visual-similarity detection: compare a baseline image (your key screen) against
suspect screenshots with a perceptual hash (pHash). A small Hamming distance means
the images look alike even after re-encoding, resizing, or light edits — useful for
spotting clones or look-alike sites once you have a candidate screenshot.

usage:
  python helmet_monitor.py <baseline.png> <suspect1.png> [suspect2.png ...]
  python helmet_monitor.py --hash <image.png>        # just print its pHash

Note: this compares images you already have. Finding candidate sites (web/search,
reverse-image) needs a search API key and is out of scope for this offline tool.
"""
import sys

import cv2
import numpy as np

THRESHOLD = 10  # Hamming distance at/below which images are "similar"


def phash(path, size=32, lowfreq=8):
    img = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise SystemExit(f"cannot read {path}")
    img = cv2.resize(img, (size, size), interpolation=cv2.INTER_AREA).astype(np.float32)
    dct = cv2.dct(img)
    block = dct[:lowfreq, :lowfreq].flatten()
    med = np.median(block[1:])  # drop the DC term
    bits = block > med
    h = 0
    for b in bits:
        h = (h << 1) | int(b)
    return h


def hamming(a, b):
    return bin(a ^ b).count("1")


def main(argv):
    if not argv:
        raise SystemExit(__doc__)
    if argv[0] == "--hash":
        print(f"{phash(argv[1]):016x}")
        return
    base = phash(argv[0])
    print(f"baseline {argv[0]}: {base:016x}")
    for s in argv[1:]:
        try:
            h = phash(s)
        except SystemExit as e:
            print(f"{s}: {e}")
            continue
        d = hamming(base, h)
        verdict = "SIMILAR" if d <= THRESHOLD else ("near" if d <= THRESHOLD * 2 else "different")
        print(f"{s}: {h:016x}  distance={d}  -> {verdict}")


if __name__ == "__main__":
    main(sys.argv[1:])
