"""Recover the session ID embedded by forensicMark() in client/app.js from a screenshot.

usage: .venv/bin/python build/decode_screenshot.py shot.png [more.png ...]
Match the printed sid against the Worker's `{"event":"session","sid":...}` log lines.
Handles arbitrary scaling (Retina, resized, cropped) and moderate JPEG compression.
"""
import sys

import cv2
import numpy as np

CELL, COLS, ROWS, SYNC = 4, 8, 6, 0xA5
TW, TH = CELL * COLS, CELL * ROWS  # tile size at canonical scale (CSS px)


SYNC_BITS = np.array([(SYNC >> i) & 1 for i in range(7, -1, -1)])


def crc8(v):
    # CRC-8/SMBUS (poly 0x07) over the 4 bytes, big-endian; matches markBits() in client/app.js.
    crc = 0
    for byte in v.to_bytes(4, "big"):
        crc ^= byte
        for _ in range(8):
            crc = ((crc << 1) ^ 0x07) & 0xFF if crc & 0x80 else (crc << 1) & 0xFF
    return crc


def bits_to_int(bits):
    v = 0
    for b in bits:
        v = (v << 1) | int(b)
    return v


def fold(hp, s):
    # Resample so one tile is exactly TW x TH pixels, then average all tiles.
    small = cv2.resize(hp, None, fx=1 / s, fy=1 / s, interpolation=cv2.INTER_AREA)
    h, w = small.shape
    h, w = h - h % TH, w - w % TW
    if h < TH * 2 or w < TW * 2:
        return None
    return small[:h, :w].reshape(h // TH, TH, w // TW, TW).mean(axis=(0, 2))


def decode_tile(tile):
    best = None
    for dy in range(CELL):
        for dx in range(CELL):
            t = np.roll(tile, (-dy, -dx), axis=(0, 1))
            core = t.reshape(ROWS, CELL, COLS, CELL)[:, 1:3, :, 1:3].mean(axis=(1, 3))
            for ry in range(ROWS):
                for rx in range(COLS):
                    m = np.roll(core, (-ry, -rx), axis=(0, 1)).ravel()
                    # Calibrate the threshold on the known sync bits.
                    ones = m[:8][SYNC_BITS == 1]
                    zeros = m[:8][SYNC_BITS == 0]
                    if ones.min() <= zeros.max():
                        continue
                    thr = (ones.mean() + zeros.mean()) / 2
                    bits = (m > thr).astype(int)
                    sid = bits_to_int(bits[8:40])
                    # crc8(0) == 0, so a flat all-zero read would otherwise pass as valid.
                    if sid in (0, 0xFFFFFFFF) or bits_to_int(bits[40:]) != crc8(sid):
                        continue
                    margin = float(np.abs(m - thr).min())
                    if best is None or margin > best[1]:
                        best = (sid, margin)
    return best


def decode(path):
    img = cv2.imread(path)
    if img is None:
        return f"{path}: cannot read"
    luma = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
    hp = np.clip(luma - cv2.GaussianBlur(luma, (0, 0), 6), -6, 6)  # keep the +-3 level mark, drop edges

    def energy(s):
        t = fold(hp, s)
        return -1 if t is None else float(t.std())

    coarse = sorted(np.arange(0.5, 4.0, 0.005), key=energy, reverse=True)[:6]
    for c in coarse:
        fine = max(np.arange(c - 0.005, c + 0.005, 0.0005), key=energy)
        hit = decode_tile(fold(hp, fine))
        if hit:
            return f"{path}: sid={hit[0]:08x} scale={fine:.4f} margin={hit[1]:.3f}"
    return f"{path}: no mark found"


if __name__ == "__main__":
    for p in sys.argv[1:]:
        print(decode(p))
