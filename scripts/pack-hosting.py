#!/usr/bin/env python3
"""Creeaza zip pentru Netlify Drop / upload manual hosting."""
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "hosting-package"
ZIP_PATH = ROOT / "AutoAlert-hosting.zip"

INCLUDE = [
    "index.html", "manifest.json", "service-worker.js", "version.json",
    "firebase-config.js", "icon.svg", "icon-192.png", "icon-512.png",
    "css/aa-v1.0.css",
    "js/aa-core.js", "js/aa-alerts.js", "js/aa-firebase.js",
    "js/aa-cars.js", "js/aa-notifications.js", "js/aa-ui.js", "js/aa-icons.js",
]

def main():
    if OUT_DIR.exists():
        shutil.rmtree(OUT_DIR)
    OUT_DIR.mkdir()
    (OUT_DIR / "js").mkdir()
    (OUT_DIR / "css").mkdir()

    missing = []
    for rel in INCLUDE:
        src = ROOT / rel
        dst = OUT_DIR / rel
        if not src.exists():
            missing.append(rel)
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)

    if missing:
        print("LIPSESC:", ", ".join(missing))
        raise SystemExit(1)

    if ZIP_PATH.exists():
        ZIP_PATH.unlink()
    with zipfile.ZipFile(ZIP_PATH, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in OUT_DIR.rglob("*"):
            if f.is_file():
                zf.write(f, f.relative_to(OUT_DIR).as_posix())

    print("OK:", ZIP_PATH)
    print("Fisiere:", len(INCLUDE))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())