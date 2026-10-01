"""Proof-of-existence for a build: hash every file into a manifest and timestamp it
with OpenTimestamps (anchored to the Bitcoin blockchain). This proves the content
EXISTED AT A TIME — useful anteriority/priority evidence in a dispute. It does NOT
make anything unique or exclusive, and it does not prevent copying.

usage:
  python helmet_timestamp.py stamp  <dir> [--out .helmet]   # manifest + .ots
  python helmet_timestamp.py upgrade <manifest.ots>          # after ~a few hours
  python helmet_timestamp.py verify  <manifest> <manifest.ots>

Run under: uv run --with opentimestamps-client python helmet_timestamp.py …
The stamp step contacts public OTS calendar servers; the .ots must later be
`upgrade`d once the Bitcoin transaction confirms, then it verifies offline.
"""
import hashlib
import subprocess
import sys
from pathlib import Path


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


def build_manifest(dist, out):
    files = sorted(p for p in Path(dist).rglob("*") if p.is_file() and p.suffix != ".ots")
    lines = [f"{sha256(p)}  {p.relative_to(dist).as_posix()}" for p in files]
    body = "\n".join(lines) + "\n"
    root = hashlib.sha256(body.encode()).hexdigest()
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    manifest = out / "manifest.sha256"
    manifest.write_text(f"# helmet manifest  root={root}  files={len(files)}\n{body}")
    print(f"manifest: {len(files)} files, root={root}\n  -> {manifest}")
    return manifest


def ots(*args):
    try:
        return subprocess.run(["ots", *args], check=False).returncode
    except FileNotFoundError:
        raise SystemExit("helmet: 'ots' not found. Run under: uv run --with opentimestamps-client python helmet_timestamp.py …")


def main(argv):
    if not argv:
        raise SystemExit(__doc__)
    cmd = argv[0]
    if cmd == "stamp":
        if len(argv) < 2:
            raise SystemExit("usage: stamp <dir> [--out dir]")
        out = argv[argv.index("--out") + 1] if "--out" in argv else ".helmet"
        manifest = build_manifest(argv[1], out)
        rc = ots("stamp", str(manifest))
        if rc == 0:
            print(f"stamped -> {manifest}.ots")
            print("Next: in a few hours run `helmet timestamp upgrade " + str(manifest) + ".ots` to anchor it, then keep both files as your proof.")
        sys.exit(rc)
    elif cmd == "upgrade":
        sys.exit(ots("upgrade", argv[1]))
    elif cmd == "verify":
        sys.exit(ots("verify", "-f", argv[1], argv[2]) if len(argv) > 2 else ots("verify", argv[1]))
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
