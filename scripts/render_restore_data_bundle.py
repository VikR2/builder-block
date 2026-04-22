#!/usr/bin/env python3
"""
Restore a Render data bundle into a target data directory and verify checksums.

Typical usage on Render shell:
python /app/scripts/render_restore_data_bundle.py \
  --bundle /tmp/render-data-bundle.zip \
  --dest /app/data \
  --replace
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalize_target_path(dest_root: Path, archive_path: str) -> Path:
    relative = Path(archive_path)
    parts = relative.parts
    if parts and parts[0] == "data":
        relative = Path(*parts[1:])
    return dest_root / relative


def main() -> None:
    parser = argparse.ArgumentParser(description="Restore a Render data bundle")
    parser.add_argument("--bundle", type=Path, required=True, help="Path to the zip bundle")
    parser.add_argument("--dest", type=Path, default=Path("/app/data"), help="Destination data root")
    parser.add_argument("--replace", action="store_true", help="Overwrite existing files")
    parser.add_argument("--verify-only", action="store_true", help="Only verify the bundle structure and checksums")
    args = parser.parse_args()

    bundle_path = args.bundle.resolve()
    dest_root = args.dest.resolve()

    if not bundle_path.exists():
        raise SystemExit(f"Bundle not found: {bundle_path}")

    with ZipFile(bundle_path, "r") as archive:
        if "manifest.json" not in archive.namelist():
            raise SystemExit("Bundle is missing manifest.json")

        manifest = json.loads(archive.read("manifest.json").decode("utf-8"))
        items = manifest.get("items")
        if not isinstance(items, list):
            raise SystemExit("Bundle manifest is invalid")

        extracted: list[Path] = []

        for item in items:
            archive_path = item["path"]
            expected_sha = item["sha256"]
            target_path = normalize_target_path(dest_root, archive_path)

            if args.verify_only:
                continue

            target_path.parent.mkdir(parents=True, exist_ok=True)

            if target_path.exists() and not args.replace:
                raise SystemExit(f"Target exists and --replace was not set: {target_path}")

            with archive.open(archive_path) as src, target_path.open("wb") as dest_file:
                dest_file.write(src.read())

            extracted.append(target_path)

            actual_sha = sha256_file(target_path)
            if actual_sha != expected_sha:
                raise SystemExit(f"Checksum mismatch for {target_path}")

    print(json.dumps({
        "status": "success",
        "bundle": str(bundle_path),
        "destination": str(dest_root),
        "verifyOnly": args.verify_only,
    }))


if __name__ == "__main__":
    main()
