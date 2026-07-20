"""
Embedding backend utilities for TCM transcript retrieval.

This module centralizes:
1. Embedding provider selection
2. Metadata normalization/versioning
3. Query/document embedding generation

The current migration supports:
- Legacy local MiniLM embeddings
- Google Gemini embedding API (`gemini-embedding-001`, `gemini-embedding-2-preview`)

Production note:
- `gemini-embedding-2-preview` remains the intended default for this project
  because the long-term retrieval plan includes text, PDFs, images, and video in
  a shared embedding space.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Sequence


LEGACY_MINILM_PROVIDER = "legacy-minilm"
GOOGLE_GEMINI_PROVIDER = "google-gemini-api"

LEGACY_MINILM_MODEL = "all-MiniLM-L6-v2"
DEFAULT_GOOGLE_MODEL = "gemini-embedding-2-preview"

TEXT_MODALITY = "text"
LEGACY_INDEX_VERSION = "legacy-minilm-v1"
GOOGLE_INDEX_VERSION = "tcm-gemini-v3"

GOOGLE_API_ROOT = "https://generativelanguage.googleapis.com/v1beta"
GOOGLE_API_KEY_ENV_VARS = ("GOOGLE_API_KEY", "GEMINI_API_KEY")
GOOGLE_BATCH_SIZE = 32
GOOGLE_MIN_REQUEST_INTERVAL_SECONDS = float(
    os.environ.get("TCM_GOOGLE_EMBED_MIN_INTERVAL_SECONDS", "2.1")
)
GOOGLE_MAX_RETRIES = int(os.environ.get("TCM_GOOGLE_EMBED_MAX_RETRIES", "5"))


@dataclass(frozen=True)
class EmbeddingMetadata:
    provider: str
    model: str
    modality: str
    index_version: str
    dimension: Optional[int] = None
    profile: Optional[str] = None

    @property
    def signature(self) -> tuple[str, str, str, str, Optional[int]]:
        return (
            self.provider,
            self.model,
            self.modality,
            self.index_version,
            self.dimension,
        )


@dataclass(frozen=True)
class EmbeddingConfig:
    provider: str
    model: str
    modality: str = TEXT_MODALITY
    index_version: str = LEGACY_INDEX_VERSION
    output_dimensionality: Optional[int] = None


def get_google_api_key() -> Optional[str]:
    for env_var in GOOGLE_API_KEY_ENV_VARS:
        value = os.getenv(env_var)
        if value:
            return value

    for env_file in _candidate_env_files():
        for env_var in GOOGLE_API_KEY_ENV_VARS:
            value = _read_env_file_value(env_file, env_var)
            if value:
                return value
    return None


def _candidate_env_files() -> list[Path]:
    project_root = Path(__file__).resolve().parents[2]
    return [
        project_root / ".env.local",
        project_root / "ui" / ".env.local",
    ]


def _read_env_file_value(env_file: Path, env_var: str) -> Optional[str]:
    if not env_file.exists():
        return None

    for raw_line in env_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key.strip() != env_var:
            continue

        cleaned = value.strip()
        if len(cleaned) >= 2 and cleaned[0] == cleaned[-1] and cleaned[0] in {"'", '"'}:
            cleaned = cleaned[1:-1]
        return cleaned or None

    return None


def normalize_embedding_metadata(raw_metadata: dict) -> EmbeddingMetadata:
    """Normalize persisted index metadata into a versioned corpus descriptor."""
    model = raw_metadata.get("model") or LEGACY_MINILM_MODEL
    provider = raw_metadata.get("provider")

    if provider is None:
        if model == LEGACY_MINILM_MODEL:
            provider = LEGACY_MINILM_PROVIDER
        elif model.startswith("gemini-embedding"):
            provider = GOOGLE_GEMINI_PROVIDER
        else:
            provider = LEGACY_MINILM_PROVIDER

    modality = raw_metadata.get("modality") or TEXT_MODALITY
    index_version = raw_metadata.get("index_version")
    if index_version is None:
        if provider == GOOGLE_GEMINI_PROVIDER:
            index_version = GOOGLE_INDEX_VERSION
        else:
            index_version = LEGACY_INDEX_VERSION

    dimension = raw_metadata.get("dimension")
    profile = raw_metadata.get("profile")
    return EmbeddingMetadata(
        provider=provider,
        model=model,
        modality=modality,
        index_version=index_version,
        dimension=int(dimension) if isinstance(dimension, (int, float)) else None,
        profile=str(profile) if profile else None,
    )


def resolve_existing_corpus_config(videos_path: Optional[Path]) -> Optional[EmbeddingConfig]:
    """Reuse the current corpus config when incrementally embedding a mixed corpus would break search."""
    if videos_path is None or not videos_path.exists():
        return None

    metadata_items: list[EmbeddingMetadata] = []
    for video_dir in sorted(videos_path.iterdir()):
        if not video_dir.is_dir():
            continue

        for metadata_name in ("segments.json", "segments.fine.json"):
            metadata_path = video_dir / metadata_name
            if not metadata_path.exists():
                continue

            try:
                with open(metadata_path, encoding="utf-8") as handle:
                    raw_metadata = json.load(handle)
                metadata_items.append(normalize_embedding_metadata(raw_metadata))
            except Exception:
                continue

    if not metadata_items:
        return None

    corpus = ensure_single_corpus_config(metadata_items)
    return EmbeddingConfig(
        provider=corpus.provider,
        model=corpus.model,
        modality=corpus.modality,
        index_version=corpus.index_version,
        output_dimensionality=corpus.dimension,
    )


def ensure_single_corpus_config(metadata_items: Sequence[EmbeddingMetadata]) -> EmbeddingMetadata:
    """Fail fast when indexes from incompatible embedding spaces are mixed together."""
    if not metadata_items:
        raise ValueError("Cannot resolve embedding corpus config from an empty metadata set")

    unique_signatures = {item.signature for item in metadata_items}
    if len(unique_signatures) > 1:
        readable = ", ".join(
            sorted(
                f"{provider}:{model}:{modality}:{index_version}:{dimension if dimension is not None else 'na'}"
                for provider, model, modality, index_version, dimension in unique_signatures
            )
        )
        raise ValueError(
            "Mixed embedding corpus detected. Rebuild or separate indexes before querying. "
            f"Found: {readable}"
        )

    return metadata_items[0]


def resolve_indexing_config(
    provider: Optional[str] = None,
    model: Optional[str] = None,
    output_dimensionality: Optional[int] = None,
    videos_path: Optional[Path] = None,
) -> EmbeddingConfig:
    """Resolve the embedding config for a new index build."""
    configured_provider = provider or os.getenv("TCM_EMBEDDING_PROVIDER")
    configured_model = model or os.getenv("TCM_EMBEDDING_MODEL")

    if not configured_provider and not configured_model:
        existing = resolve_existing_corpus_config(videos_path)
        if existing is not None:
            return EmbeddingConfig(
                provider=existing.provider,
                model=existing.model,
                modality=existing.modality,
                index_version=existing.index_version,
                output_dimensionality=existing.output_dimensionality,
            )

    resolved_provider = configured_provider or GOOGLE_GEMINI_PROVIDER

    resolved_model = configured_model
    if not resolved_model:
        resolved_model = DEFAULT_GOOGLE_MODEL if resolved_provider == GOOGLE_GEMINI_PROVIDER else LEGACY_MINILM_MODEL

    index_version = GOOGLE_INDEX_VERSION if resolved_provider == GOOGLE_GEMINI_PROVIDER else LEGACY_INDEX_VERSION

    return EmbeddingConfig(
        provider=resolved_provider,
        model=resolved_model,
        modality=TEXT_MODALITY,
        index_version=index_version,
        output_dimensionality=output_dimensionality,
    )


class BaseEmbedder:
    def __init__(self, config: EmbeddingConfig):
        self.config = config

    def embed_documents(self, texts: Sequence[str]) -> list[list[float]]:
        raise NotImplementedError

    def embed_queries(self, texts: Sequence[str]) -> list[list[float]]:
        raise NotImplementedError


class SentenceTransformerEmbedder(BaseEmbedder):
    def __init__(self, config: EmbeddingConfig):
        super().__init__(config)
        from sentence_transformers import SentenceTransformer

        self._model = SentenceTransformer(config.model)

    def _encode(self, texts: Sequence[str]) -> list[list[float]]:
        embeddings = self._model.encode(list(texts), show_progress_bar=False)
        return [list(map(float, row)) for row in embeddings]

    def embed_documents(self, texts: Sequence[str]) -> list[list[float]]:
        return self._encode(texts)

    def embed_queries(self, texts: Sequence[str]) -> list[list[float]]:
        return self._encode(texts)


class GoogleGeminiEmbedder(BaseEmbedder):
    def __init__(self, config: EmbeddingConfig):
        super().__init__(config)
        api_key = get_google_api_key()
        if not api_key:
            raise RuntimeError(
                "Google Gemini embeddings require GOOGLE_API_KEY or GEMINI_API_KEY to be set"
            )
        self._api_key = api_key
        self._last_request_started_at = 0.0

    def _wait_for_request_slot(self) -> None:
        elapsed = time.monotonic() - self._last_request_started_at
        remaining = GOOGLE_MIN_REQUEST_INTERVAL_SECONDS - elapsed
        if remaining > 0:
            time.sleep(remaining)

    def _send_batch_request(self, request: urllib.request.Request) -> dict:
        for attempt in range(GOOGLE_MAX_RETRIES + 1):
            self._wait_for_request_slot()
            self._last_request_started_at = time.monotonic()

            try:
                with urllib.request.urlopen(request, timeout=60) as response:
                    return json.loads(response.read().decode("utf-8"))
            except urllib.error.HTTPError as exc:
                detail = exc.read().decode("utf-8", errors="replace")
                if exc.code != 429 or attempt >= GOOGLE_MAX_RETRIES:
                    raise RuntimeError(
                        f"Google Gemini embedding request failed with {exc.code}: {detail}"
                    ) from exc

                retry_after = exc.headers.get("Retry-After") if exc.headers else None
                try:
                    retry_delay = float(retry_after) if retry_after else 10.0 * (2 ** attempt)
                except ValueError:
                    retry_delay = 10.0 * (2 ** attempt)
                retry_delay = min(max(retry_delay, 2.0), 60.0)
                print(
                    f"  Gemini quota limit reached; retrying batch in {retry_delay:.0f}s "
                    f"({attempt + 1}/{GOOGLE_MAX_RETRIES})"
                )
                time.sleep(retry_delay)

        raise RuntimeError("Google Gemini embedding request retry loop ended unexpectedly")

    def _embed(self, texts: Sequence[str], task_type: str) -> list[list[float]]:
        vectors: list[list[float]] = []
        for batch_start in range(0, len(texts), GOOGLE_BATCH_SIZE):
            batch = texts[batch_start:batch_start + GOOGLE_BATCH_SIZE]
            requests: list[dict[str, object]] = []

            for text in batch:
                request_payload: dict[str, object] = {
                    "model": f"models/{self.config.model}",
                    "content": {
                        "parts": [{"text": text}],
                    },
                    "taskType": task_type,
                }
                if self.config.output_dimensionality:
                    request_payload["outputDimensionality"] = self.config.output_dimensionality
                requests.append(request_payload)

            payload = {"requests": requests}
            url = f"{GOOGLE_API_ROOT}/models/{self.config.model}:batchEmbedContents"
            request = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    "x-goog-api-key": self._api_key,
                },
                method="POST",
            )

            body = self._send_batch_request(request)

            embeddings = body.get("embeddings")
            if not isinstance(embeddings, list):
                raise RuntimeError("Google Gemini embedding response did not include embeddings")

            for embedding_payload in embeddings:
                values = embedding_payload.get("values")
                if values is None and isinstance(embedding_payload.get("embedding"), dict):
                    values = embedding_payload["embedding"].get("values")
                if not values:
                    raise RuntimeError("Google Gemini embedding response did not include embedding values")
                vectors.append([float(value) for value in values])

        return vectors

    def embed_documents(self, texts: Sequence[str]) -> list[list[float]]:
        return self._embed(texts, task_type="RETRIEVAL_DOCUMENT")

    def embed_queries(self, texts: Sequence[str]) -> list[list[float]]:
        return self._embed(texts, task_type="RETRIEVAL_QUERY")


def build_embedder(config: EmbeddingConfig) -> BaseEmbedder:
    if config.provider == GOOGLE_GEMINI_PROVIDER:
        return GoogleGeminiEmbedder(config)
    if config.provider == LEGACY_MINILM_PROVIDER:
        return SentenceTransformerEmbedder(config)
    raise ValueError(f"Unsupported embedding provider: {config.provider}")
