"""
Persistent FAISS search worker.

Loads transcript indexes and the embedding model once, then accepts JSON
requests over stdin and returns JSON responses over stdout.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from faiss_search import VideoSearcher


def main() -> int:
    script_dir = Path(__file__).parent
    project_root = script_dir.parent.parent
    videos_path = project_root / "data" / "local-videos"

    searcher = VideoSearcher(videos_path)
    corpus_info = searcher.get_corpus_info()
    print(json.dumps({
        "type": "ready",
        "indexes": len(searcher.indexes),
        "corpus": corpus_info,
    }), flush=True)

    for raw_line in sys.stdin:
      line = raw_line.strip()
      if not line:
          continue

      request_id = None
      try:
          payload = json.loads(line)
          request_id = payload.get("id")
          command = payload.get("command")

          if command == "search":
              result = json.loads(searcher.search_json(payload["query"], int(payload.get("topK", 5))))
          elif command == "search_with_boundary":
              boundary_json = searcher.search_with_boundary_json(
                  payload["query"],
                  float(payload.get("similarityThreshold", 0.4)),
                  float(payload.get("maxExtensionSeconds", 300.0)),
                  float(payload.get("minDurationSeconds", 60.0)),
              )
              result = None if boundary_json == "null" else json.loads(boundary_json)
          elif command == "health":
              result = {
                  "indexes": len(searcher.indexes),
                  "corpus": searcher.get_corpus_info(),
              }
          else:
              raise ValueError(f"Unsupported command: {command}")

          print(json.dumps({
              "id": request_id,
              "ok": True,
              "result": result,
          }), flush=True)
      except Exception as exc:  # pragma: no cover - defensive worker boundary
          print(json.dumps({
              "id": request_id,
              "ok": False,
              "error": str(exc),
          }), flush=True)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
