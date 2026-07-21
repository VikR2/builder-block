import importlib.util
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


MODULE_PATH = Path(__file__).resolve().parents[1] / "lib" / "media_extraction.py"
SPEC = importlib.util.spec_from_file_location("media_extraction", MODULE_PATH)
assert SPEC and SPEC.loader
media = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(media)


class TranscribeVideoAudioCleanupTests(unittest.TestCase):
    def test_effective_frame_interval_expands_to_cover_long_video(self) -> None:
        self.assertEqual(
            media.effective_frame_interval(
                duration_seconds=2787,
                requested_interval=45,
                max_frames=30,
            ),
            92,
        )

    def test_effective_frame_interval_keeps_requested_interval_below_cap(self) -> None:
        self.assertEqual(
            media.effective_frame_interval(
                duration_seconds=600,
                requested_interval=45,
                max_frames=30,
            ),
            45,
        )

    def test_isolate_audio_with_elevenlabs_converts_mpeg_output_to_wav(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            audio_path = temp_path / "audio.raw.wav"
            output_path = temp_path / "audio.cleaned.wav"
            audio_path.write_bytes(b"raw-audio")

            class FakeResponse:
                def __init__(self) -> None:
                    self._response = SimpleNamespace(headers={"content-type": "audio/mpeg"})
                    self.data = iter([b"ID3", b"\x00\x01\x02"])

                def __enter__(self):
                    return self

                def __exit__(self, exc_type, exc, tb):
                    return False

            class FakeClient:
                def __init__(self, api_key: str) -> None:
                    self.api_key = api_key
                    self.audio_isolation = SimpleNamespace(
                        with_raw_response=SimpleNamespace(convert=self.convert)
                    )

                def convert(self, **kwargs):
                    return FakeResponse()

            def fake_convert_audio_to_wav(input_path: Path, normalized_output_path: Path, sample_rate: int = 16000, channels: int = 1) -> Path:
                self.assertTrue(input_path.name.endswith(".isolated.mp3"))
                self.assertEqual(sample_rate, 16000)
                self.assertEqual(channels, 1)
                normalized_output_path.write_bytes(b"normalized-wav")
                return normalized_output_path

            with patch.object(media, "ElevenLabs", FakeClient), \
                    patch.object(media, "convert_audio_to_wav", side_effect=fake_convert_audio_to_wav) as convert_mock:
                result = media.isolate_audio_with_elevenlabs(audio_path, output_path, api_key="test-key")

            self.assertEqual(result, output_path)
            self.assertTrue(output_path.exists())
            self.assertEqual(output_path.read_bytes(), b"normalized-wav")
            self.assertFalse((temp_path / "audio.cleaned.isolated.mp3").exists())
            convert_mock.assert_called_once()

    def test_elevenlabs_cleanup_chunks_long_audio_before_transcription(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            video_path = temp_path / "video.mp4"
            output_dir = temp_path / "out"
            output_dir.mkdir()
            video_path.write_bytes(b"video")

            raw_audio_path = output_dir / "audio.raw.wav"
            cleaned_audio_path = output_dir / "audio.cleaned.wav"
            def fake_extract_audio(_video_path: Path, output_path: Path) -> Path:
                self.assertEqual(output_path, raw_audio_path)
                raw_audio_path.write_bytes(b"raw")
                return raw_audio_path

            with patch.object(media, "extract_audio", side_effect=fake_extract_audio), \
                    patch.object(media, "get_video_duration", return_value=4901), \
                    patch.object(media, "isolate_long_audio_with_elevenlabs", return_value=cleaned_audio_path) as isolate_long_mock, \
                    patch.object(
                        media,
                        "transcribe_with_elevenlabs",
                        return_value={"transcript": "ok", "timed_segments": []},
                    ) as transcribe_mock:
                result = media.transcribe_video(
                    video_path,
                    output_dir,
                    backend="elevenlabs",
                    elevenlabs_key="test-key",
                    audio_cleanup_mode="voice_isolator",
                )

            isolate_long_mock.assert_called_once_with(
                raw_audio_path,
                cleaned_audio_path,
                "test-key",
            )
            transcribe_mock.assert_called_once_with(
                cleaned_audio_path,
                api_key="test-key",
                keyterms=None,
            )
            self.assertEqual(result["audio_cleanup_status"], "completed")
            self.assertEqual(result["cleaned_audio_path"], str(cleaned_audio_path))

    def test_elevenlabs_cleanup_uses_cleaned_audio_when_available(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            video_path = temp_path / "video.mp4"
            output_dir = temp_path / "out"
            output_dir.mkdir()
            video_path.write_bytes(b"video")

            raw_audio_path = output_dir / "audio.raw.wav"
            cleaned_audio_path = output_dir / "audio.cleaned.wav"

            def fake_extract_audio(_video_path: Path, output_path: Path) -> Path:
                self.assertEqual(output_path, raw_audio_path)
                raw_audio_path.write_bytes(b"raw")
                return raw_audio_path

            def fake_isolate_audio(audio_path: Path, output_path: Path, api_key: str) -> Path:
                self.assertEqual(audio_path, raw_audio_path)
                self.assertEqual(output_path, cleaned_audio_path)
                self.assertEqual(api_key, "test-key")
                cleaned_audio_path.write_bytes(b"cleaned")
                return cleaned_audio_path

            with patch.object(media, "extract_audio", side_effect=fake_extract_audio), \
                    patch.object(media, "isolate_audio_with_elevenlabs", side_effect=fake_isolate_audio), \
                    patch.object(
                        media,
                        "transcribe_with_elevenlabs",
                        return_value={"transcript": "ok", "timed_segments": []},
                    ) as transcribe_mock:
                result = media.transcribe_video(
                    video_path,
                    output_dir,
                    backend="elevenlabs",
                    elevenlabs_key="test-key",
                    audio_cleanup_mode="voice_isolator",
                    keyterms=["mentor"],
                )

            transcribe_mock.assert_called_once_with(
                cleaned_audio_path,
                api_key="test-key",
                keyterms=["mentor"],
            )
            self.assertEqual(result["audio_cleanup_status"], "completed")
            self.assertEqual(result["cleaned_audio_path"], str(cleaned_audio_path))

    def test_elevenlabs_cleanup_falls_back_to_raw_audio_when_isolation_fails(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            video_path = temp_path / "video.mp4"
            output_dir = temp_path / "out"
            output_dir.mkdir()
            video_path.write_bytes(b"video")

            raw_audio_path = output_dir / "audio.raw.wav"
            cleaned_audio_path = output_dir / "audio.cleaned.wav"

            def fake_extract_audio(_video_path: Path, output_path: Path) -> Path:
                self.assertEqual(output_path, raw_audio_path)
                raw_audio_path.write_bytes(b"raw")
                return raw_audio_path

            def fake_isolate_audio(_audio_path: Path, output_path: Path, _api_key: str) -> Path:
                output_path.write_bytes(b"partial")
                raise RuntimeError("boom")

            with patch.object(media, "extract_audio", side_effect=fake_extract_audio), \
                    patch.object(media, "isolate_audio_with_elevenlabs", side_effect=fake_isolate_audio), \
                    patch.object(
                        media,
                        "transcribe_with_elevenlabs",
                        return_value={"transcript": "ok", "timed_segments": []},
                    ) as transcribe_mock:
                result = media.transcribe_video(
                    video_path,
                    output_dir,
                    backend="elevenlabs",
                    elevenlabs_key="test-key",
                    audio_cleanup_mode="voice_isolator",
                )

            transcribe_mock.assert_called_once_with(
                raw_audio_path,
                api_key="test-key",
                keyterms=None,
            )
            self.assertEqual(result["audio_cleanup_status"], "failed_fallback_raw")
            self.assertIsNone(result["cleaned_audio_path"])
            self.assertFalse(cleaned_audio_path.exists())


if __name__ == "__main__":
    unittest.main()
