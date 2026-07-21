#!/usr/bin/env python3
"""
Create a Render data migration bundle for runtime state that should not go to git.

Bundle contents:
- data/builder.db (SQLite snapshot)
- data/local-videos/** (artifacts, transcripts, FAISS indexes)
- optional legacy local video corpus

Output:
- zip archive
- manifest JSON inside the archive with sha256 checksums
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sqlite3
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sqlite_backup(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(source) as src_conn:
        with sqlite3.connect(destination) as dest_conn:
            src_conn.backup(dest_conn)


def iter_files(root: Path) -> list[Path]:
    return [path for path in root.rglob("*") if path.is_file()]


def add_file_to_bundle(
    archive: ZipFile,
    file_path: Path,
    archive_path: str,
    manifest_items: list[dict[str, object]],
) -> None:
    archive.write(file_path, archive_path)
    manifest_items.append(
        {
            "path": archive_path,
            "size": file_path.stat().st_size,
            "sha256": sha256_file(file_path),
        }
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Create a Render runtime data bundle")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(".runtime/render-data/render-data-bundle.zip"),
        help="Path to the output zip bundle",
    )
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="Repository root",
    )
    parser.add_argument(
        "--include-legacy",
        action="store_true",
        help="Include data/local-videos-legacy in the bundle",
    )
    args = parser.parse_args()

    repo_root = args.repo_root.resolve()
    data_dir = repo_root / "data"
    db_path = data_dir / "builder.db"
    local_videos_dir = data_dir / "local-videos"
    legacy_dir = data_dir / "local-videos-legacy"
    output_path = args.output.resolve()

    output_path.parent.mkdir(parents=True, exist_ok=True)

    if not db_path.exists():
        raise SystemExit(f"Database not found: {db_path}")

    manifest: dict[str, object] = {
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "repoRoot": str(repo_root),
        "items": [],
    }
    manifest_items: list[dict[str, object]] = manifest["items"]  # type: ignore[assignment]

    with tempfile.TemporaryDirectory() as temp_dir_str:
        temp_dir = Path(temp_dir_str)
        db_snapshot = temp_dir / "builder.db"
        sqlite_backup(db_path, db_snapshot)

        with ZipFile(output_path, "w", compression=ZIP_DEFLATED, compresslevel=6) as archive:
            add_file_to_bundle(archive, db_snapshot, "data/builder.db", manifest_items)

            if local_videos_dir.exists():
                for file_path in iter_files(local_videos_dir):
                    relative = file_path.relative_to(repo_root).as_posix()
                    add_file_to_bundle(archive, file_path, relative, manifest_items)

            if args.include_legacy and legacy_dir.exists():
                for file_path in iter_files(legacy_dir):
                    relative = file_path.relative_to(repo_root).as_posix()
                    add_file_to_bundle(archive, file_path, relative, manifest_items)

            manifest_bytes = json.dumps(manifest, indent=2).encode("utf-8")
            archive.writestr("manifest.json", manifest_bytes)

    total_size = os.path.getsize(output_path)
    print(json.dumps({
        "status": "success",
        "output": str(output_path),
        "fileCount": len(manifest_items),
        "sizeBytes": total_size,
    }))


if __name__ == "__main__":
    main()
