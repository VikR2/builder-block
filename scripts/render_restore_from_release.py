#!/usr/bin/env python3
"""
Download a split Render data bundle from a GitHub release, reconstruct it, and
restore it into /app/data while writing progress to a status JSON file.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.request
from pathlib import Path


def write_status(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def download_file(url: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url, timeout=300) as response:
        with destination.open("wb") as handle:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                handle.write(chunk)


def main() -> int:
    parser = argparse.ArgumentParser(description="Restore Render data bundle from GitHub release assets")
    parser.add_argument("--repo", required=True)
    parser.add_argument("--tag", required=True)
    parser.add_argument("--dest", default="/app/data")
    parser.add_argument("--status-file", required=True)
    args = parser.parse_args()

    status_path = Path(args.status_file)
    temp_dir = Path("/tmp/builder-block-render-restore")
    manifest_path = temp_dir / "render-data-bundle.parts.json"
    zip_path = temp_dir / "render-data-bundle.zip"

    try:
        write_status(status_path, {
            "status": "starting",
            "repo": args.repo,
            "tag": args.tag,
        })

        temp_dir.mkdir(parents=True, exist_ok=True)

        manifest_url = f"https://github.com/{args.repo}/releases/download/{args.tag}/render-data-bundle.parts.json"
        write_status(status_path, {
            "status": "downloading_manifest",
            "url": manifest_url,
        })
        download_file(manifest_url, manifest_path)

        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        parts = manifest.get("parts", [])
        if not isinstance(parts, list) or not parts:
            raise RuntimeError("Manifest is missing bundle parts")

        downloaded_parts: list[Path] = []
        for index, item in enumerate(parts, start=1):
            name = item["name"]
            part_url = f"https://github.com/{args.repo}/releases/download/{args.tag}/{name}"
            part_path = temp_dir / name
            write_status(status_path, {
                "status": "downloading_part",
                "part": name,
                "partIndex": index,
                "partCount": len(parts),
            })
            download_file(part_url, part_path)
            downloaded_parts.append(part_path)

        write_status(status_path, {
            "status": "combining_parts",
            "partCount": len(downloaded_parts),
        })
        with zip_path.open("wb") as zip_handle:
            for part_path in downloaded_parts:
                with part_path.open("rb") as handle:
                    while True:
                        chunk = handle.read(1024 * 1024)
                        if not chunk:
                            break
                        zip_handle.write(chunk)

        write_status(status_path, {
            "status": "restoring_bundle",
            "bundle": str(zip_path),
            "destination": args.dest,
        })
        completed = subprocess.run(
            [
                sys.executable,
                "/app/scripts/render_restore_data_bundle.py",
                "--bundle",
                str(zip_path),
                "--dest",
                args.dest,
                "--replace",
            ],
            capture_output=True,
            text=True,
            check=False,
        )

        if completed.returncode != 0:
            raise RuntimeError(completed.stderr.strip() or completed.stdout.strip() or f"Restore failed with code {completed.returncode}")

        write_status(status_path, {
            "status": "success",
            "bundle": str(zip_path),
            "destination": args.dest,
            "stdout": completed.stdout.strip(),
        })
        return 0
    except Exception as exc:  # noqa: BLE001
        write_status(status_path, {
            "status": "error",
            "error": str(exc),
        })
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
