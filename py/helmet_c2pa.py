"""C2PA Content Credentials: embed a cryptographically signed provenance manifest
(who / when / how, plus author + copyright) into an image. Tamper-evident and
verifiable — a stronger origin claim than a bare watermark, because it is signed.

usage:
  python helmet_c2pa.py sign <image> [--out out.jpg] [--author NAME] [--copyright TEXT]
                                      [--cert cert.pem --key key.pem] [--manifest m.json]
  python helmet_c2pa.py verify <image>

Run under: uv run --with c2pa-python python helmet_c2pa.py …

The demo auto-generates a SELF-SIGNED ES256 certificate (stored in .helmet/c2pa/).
Validators will show the credential but flag the signer as untrusted — for
production, sign with a certificate from a C2PA-recognized certificate authority.
"""
import json
import subprocess
import sys
from pathlib import Path

from c2pa import Builder, Reader, Signer, C2paSignerInfo

CERT_DIR = Path(".helmet/c2pa")


def _genkey(path):
    # PKCS#8 "PRIVATE KEY" PEM (ecparam -genkey emits SEC1, which c2pa rejects).
    subprocess.run(["openssl", "genpkey", "-algorithm", "EC", "-pkeyopt", "ec_paramgen_curve:P-256", "-out", str(path)], check=True, capture_output=True)


def ensure_cert(cert_path, key_path):
    # c2pa rejects a self-signed leaf, so build a local CA and a leaf signed by it;
    # cert_path holds the chain (leaf + CA). Demo only — not a trusted anchor.
    if cert_path.exists() and key_path.exists():
        return
    d = cert_path.parent
    d.mkdir(parents=True, exist_ok=True)
    ca_key, ca_pem, leaf_csr, leaf_pem, ext = d / "ca.key", d / "ca.pem", d / "leaf.csr", d / "leaf.pem", d / "leaf.ext"
    _genkey(ca_key)
    subprocess.run([
        "openssl", "req", "-new", "-x509", "-key", str(ca_key), "-out", str(ca_pem), "-days", "3650",
        "-subj", "/CN=Helmet Demo CA/O=Helmet",
        "-addext", "basicConstraints=critical,CA:TRUE", "-addext", "keyUsage=critical,keyCertSign,cRLSign",
    ], check=True, capture_output=True)
    _genkey(key_path)
    subprocess.run(["openssl", "req", "-new", "-key", str(key_path), "-out", str(leaf_csr), "-subj", "/CN=Helmet Demo Signer/O=Helmet"], check=True, capture_output=True)
    ext.write_text("basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=critical,emailProtection\n")
    subprocess.run([
        "openssl", "x509", "-req", "-in", str(leaf_csr), "-CA", str(ca_pem), "-CAkey", str(ca_key),
        "-CAcreateserial", "-out", str(leaf_pem), "-days", "3650", "-extfile", str(ext),
    ], check=True, capture_output=True)
    cert_path.write_bytes(leaf_pem.read_bytes() + ca_pem.read_bytes())  # chain: leaf + CA
    for tmp in (leaf_csr, ext):
        tmp.unlink(missing_ok=True)
    print(f"c2pa: generated demo CA + leaf chain -> {cert_path} (demo only; not a trusted anchor)")


# IPTC DigitalSourceType; actions.v2 requires one on c2pa.created. Default marks
# human-made (not AI); override with --source-type for camera captures etc.
DEFAULT_SOURCE_TYPE = "http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture"


def default_manifest(title, author, copyright_, source_type):
    cw = {"@context": "https://schema.org", "@type": "CreativeWork"}
    if author:
        cw["author"] = [{"@type": "Person", "name": author}]
    if copyright_:
        cw["copyrightNotice"] = copyright_
    return {
        "claim_generator": "Helmet/0.1",
        "title": title,
        "assertions": [
            {"label": "c2pa.actions", "data": {"actions": [
                {"action": "c2pa.created", "digitalSourceType": source_type},
            ]}},
            {"label": "stds.schema-org.CreativeWork", "data": cw, "kind": "Json"},
        ],
    }


MIME = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}


def sign(argv):
    img = Path(argv[0])
    opt = lambda k, d=None: argv[argv.index(k) + 1] if k in argv else d
    out = Path(opt("--out", str(img.with_name(img.stem + "_c2pa" + img.suffix))))
    cert_path = Path(opt("--cert", str(CERT_DIR / "cert.pem")))
    key_path = Path(opt("--key", str(CERT_DIR / "key.pem")))
    ensure_cert(cert_path, key_path)

    if "--manifest" in argv:
        manifest = json.loads(Path(opt("--manifest")).read_text())
    else:
        manifest = default_manifest(img.name, opt("--author"), opt("--copyright"), opt("--source-type", DEFAULT_SOURCE_TYPE))

    info = C2paSignerInfo(
        alg=b"es256",
        sign_cert=cert_path.read_bytes(),
        private_key=key_path.read_bytes(),
        ta_url=None,
    )
    signer = Signer.from_info(info)
    fmt = MIME.get(img.suffix.lower(), "image/jpeg")
    builder = Builder.from_json(json.dumps(manifest))
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(img, "rb") as src, open(out, "wb") as dst:
        builder.sign(signer, fmt, src, dst)
    print(f"c2pa: signed {img.name} -> {out}")


def verify(argv):
    path = argv[0]
    try:
        reader = Reader(path)
    except Exception as e:
        raise SystemExit(f"c2pa: no readable Content Credential in {path} ({e})")
    data = json.loads(reader.json())
    state = None
    try:
        state = reader.get_validation_state()
    except Exception:
        pass
    print(f"c2pa: validation state = {state}")
    active = data.get("active_manifest")
    manifests = data.get("manifests", {})
    m = manifests.get(active, {})
    print(f"  title: {m.get('title')}")
    print(f"  claim_generator: {m.get('claim_generator')}")
    for a in m.get("assertions", []):
        if a.get("label") == "stds.schema-org.CreativeWork":
            d = a.get("data", {})
            print(f"  author: {d.get('author')}")
            print(f"  copyright: {d.get('copyrightNotice')}")


def main(argv):
    if not argv:
        raise SystemExit(__doc__)
    if argv[0] == "sign":
        sign(argv[1:])
    elif argv[0] == "verify":
        verify(argv[1:])
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
