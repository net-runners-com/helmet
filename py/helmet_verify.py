"""Check whether an image carries Helmet's invisible DWT-DCT-SVD watermark.

usage: uv run --with numpy --with opencv-python-headless --with invisible-watermark \
         python py/helmet_verify.py <watermark-text> image.jpg [more.jpg ...]

Exact decode is per-frame lossy under JPEG; for a set of frames use the printed
majority vote, which is what helmet_assets.py verifies on build.
"""
import sys

import cv2
from imwatermark import WatermarkDecoder


def main(argv):
    if len(argv) < 2:
        raise SystemExit(__doc__)
    mark = argv[0].encode()
    dec = WatermarkDecoder("bytes", len(mark) * 8)
    got = []
    for path in argv[1:]:
        img = cv2.imread(path)
        if img is None:
            print(f"{path}: cannot read")
            continue
        g = dec.decode(img, "dwtDctSvd")
        got.append(g)
        print(f"{path}: {'MATCH' if g == mark else g!r}")
    if len(got) > 1:
        vote = bytes(
            sum((sum(((g[n] >> i) & 1) for g in got) * 2 > len(got)) << i for i in range(8))
            for n in range(len(mark))
        )
        print(f"majority vote across {len(got)} images: {'MATCH' if vote == mark else vote!r}")


if __name__ == "__main__":
    main(sys.argv[1:])
