#!/usr/bin/env python3
"""Verifică fișierele necesare înainte de deploy Firebase Hosting."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REQUIRED = [
    "index.html", "manifest.json", "service-worker.js", "version.json",
    "firebase-config.js", "database.rules.json", "firebase.json",
    "css/aa-v1.0.css",
    "js/aa-core.js", "js/aa-alerts.js", "js/aa-firebase.js",
    "js/aa-cars.js", "js/aa-notifications.js", "js/aa-ui.js", "js/aa-icons.js",
    "icon.svg", "icon-192.png", "icon-512.png",
]

def main():
    missing = [p for p in REQUIRED if not (ROOT / p).exists()]
    if missing:
        print("MISSING:")
        for m in missing:
            print(" ", m)
        raise SystemExit(1)
    cfg = (ROOT / "firebase-config.js").read_text(encoding="utf-8")
    if "YOUR_API_KEY" in cfg:
        print("firebase-config.js încă are placeholder YOUR_API_KEY")
        raise SystemExit(1)
    print("preflight OK —", len(REQUIRED), "fișiere")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())