import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "generate_shorts_brief.py"
SPEC = importlib.util.spec_from_file_location("generate_shorts_brief", SCRIPT_PATH)
assert SPEC and SPEC.loader
shorts = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(shorts)


class GenerateShortsBriefTests(unittest.TestCase):
    def make_video_dir(self) -> Path:
        temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(temp_dir.cleanup)
        video_dir = Path(temp_dir.name)
        (video_dir / "frames").mkdir(parents=True, exist_ok=True)
        for frame_name in ("frame_001.jpg", "frame_002.jpg", "frame_003.jpg"):
            (video_dir / "frames" / frame_name).write_bytes(b"fake-frame")

        lesson_payload = {
            "videoId": "test-video",
            "videoTitle": "Revisiting Expansions",
            "generatedAt": "2026-03-17T10:00:00Z",
            "status": "ready",
            "generationMode": "deterministic-fallback",
            "quality": {"score": 1.0, "flags": []},
            "summary": (
                "This lesson explains how an expansion forms, when it fails, and why traders "
                "need a confirming shift before treating the move as valid."
            ),
            "keyTakeaways": [
                "An expansion is a sequence of candles closing in one direction.",
                "A failed expansion gives you a range, not an automatic reversal.",
                "The confirming close is what changes the read."
            ],
            "recommendedMoments": [
                {
                    "title": "Failed Expansion and Confirmation",
                    "timestamp": 120.0,
                    "timestampLabel": "2:00",
                    "reason": (
                        "This section shows the failed expansion, the range that forms, and the "
                        "close traders need before calling it a valid shift."
                    ),
                }
            ],
            "suggestedQuestions": [
                "How do I know an expansion has actually failed?",
                "What confirmation should I wait for after the range forms?",
                "Why is the close more important than the wick?",
                "What invalidates the setup?"
            ],
            "sections": [
                {
                    "title": "Failed Expansion and Confirmation",
                    "timestamp": 120.0,
                    "timestampLabel": "2:00",
                    "startTime": 120.0,
                    "endTime": 180.0,
                    "summary": (
                        "A failed expansion creates a range, but the trade only becomes actionable "
                        "after price closes through the level that proves the shift."
                    ),
                    "citation": "Revisiting Expansions @ 2:00",
                    "transcriptExcerpt": (
                        "Price stops closing lower, the range is obvious, and the next thing that matters "
                        "is whether price can close back through the level that confirms strength."
                    ),
                }
            ],
        }
        manifest_payload = {
            "source_title": "Revisiting Expansions",
            "video_duration_sec": 600,
            "frames": [
                {
                    "index": 1,
                    "frame_path": "frames/frame_001.jpg",
                    "timestamp_sec": 90,
                    "transcript_segment": "Price is still expanding lower here."
                },
                {
                    "index": 2,
                    "frame_path": "frames/frame_002.jpg",
                    "timestamp_sec": 135,
                    "transcript_segment": "The expansion fails and the range is clear."
                },
                {
                    "index": 3,
                    "frame_path": "frames/frame_003.jpg",
                    "timestamp_sec": 165,
                    "transcript_segment": "The confirming close changes the read."
                },
            ],
        }
        transcript_payload = [
            {
                "start": 118.0,
                "end": 140.0,
                "text": "The failed expansion gives you a range, not a reversal by itself."
            },
            {
                "start": 140.0,
                "end": 176.0,
                "text": "The confirming close is what tells you whether the shift is real."
            },
        ]

        (video_dir / "lesson.json").write_text(json.dumps(lesson_payload), encoding="utf-8")
        (video_dir / "manifest.json").write_text(json.dumps(manifest_payload), encoding="utf-8")
        (video_dir / "transcript_timed.json").write_text(json.dumps(transcript_payload), encoding="utf-8")
        return video_dir

    def test_build_shorts_brief_contains_required_fields_and_editorial_rules(self) -> None:
        video_dir = self.make_video_dir()

        brief = shorts.build_shorts_brief(video_dir)

        self.assertEqual(brief["conceptName"], "Failed Expansion and Confirmation")
        self.assertIn("teachingGoal", brief)
        self.assertIn("misconception", brief)
        self.assertIn("coreRule", brief)
        self.assertIn("voiceoverScript", brief)
        self.assertIn("captionLines", brief)
        self.assertIn("chartReferenceFrames", brief)
        self.assertIn("visualNotes", brief)
        self.assertIn("genVisualPrompts", brief)
        self.assertIn("qaChecklist", brief)
        self.assertTrue(brief["allNewVisuals"])
        self.assertEqual(brief["sourceFootagePolicy"], "reference-only")
        self.assertIn("one concept per clip", brief["editorialRules"])
        self.assertIn("no original source footage in final output", brief["editorialRules"])

    def test_voiceover_and_captions_stay_instructional_and_end_on_a_rule(self) -> None:
        video_dir = self.make_video_dir()

        brief = shorts.build_shorts_brief(video_dir)

        full_script = " ".join(segment["text"] for segment in brief["voiceoverScript"]).lower()
        self.assertNotIn("subscribe", full_script)
        self.assertNotIn("profit", full_script)
        self.assertNotIn("pnl", full_script)
        self.assertTrue(
            any(
                segment["text"].startswith(("The rule is", "This matters because", "If this part is missing"))
                for segment in brief["voiceoverScript"]
            )
        )
        self.assertTrue(all(item["endTime"] > item["startTime"] for item in brief["captionLines"]))
        self.assertTrue(all(len(item["text"].split()) <= 10 for item in brief["captionLines"]))

    def test_chart_reference_frames_anchor_the_selected_teaching_moment(self) -> None:
        video_dir = self.make_video_dir()

        brief = shorts.build_shorts_brief(video_dir)

        frames = brief["chartReferenceFrames"]
        self.assertGreaterEqual(len(frames), 2)
        self.assertTrue(any(frame["timestamp"] == 135 for frame in frames))
        self.assertTrue(all(frame["framePath"].startswith("frames/") for frame in frames))
        self.assertTrue(all(frame["purpose"] for frame in frames))

    def test_picker_prefers_teachable_window_and_builds_frame_paths_from_manifest_files(self) -> None:
        video_dir = self.make_video_dir()

        lesson_path = video_dir / "lesson.json"
        lesson_payload = json.loads(lesson_path.read_text(encoding="utf-8"))
        lesson_payload["recommendedMoments"].insert(0, {
            "title": "Overlong Book Theory",
            "timestamp": 0.0,
            "timestampLabel": "0:00",
            "reason": "This is too broad to drive a 30 second short."
        })
        lesson_payload["sections"].insert(0, {
            "title": "Overlong Book Theory",
            "timestamp": 0.0,
            "timestampLabel": "0:00",
            "startTime": 0.0,
            "endTime": 600.0,
            "summary": "A broad overview that spans the full lesson instead of one teachable clip.",
            "citation": "Revisiting Expansions @ 0:00",
            "transcriptExcerpt": "This section is intentionally too long for the short-format picker."
        })
        lesson_path.write_text(json.dumps(lesson_payload), encoding="utf-8")

        manifest_path = video_dir / "manifest.json"
        manifest_payload = json.loads(manifest_path.read_text(encoding="utf-8"))
        for index, frame in enumerate(manifest_payload["frames"], start=1):
            frame.pop("frame_path", None)
            frame["file"] = f"frame_{index:03d}.jpg"
        manifest_path.write_text(json.dumps(manifest_payload), encoding="utf-8")

        brief = shorts.build_shorts_brief(video_dir)

        self.assertEqual(brief["conceptName"], "Failed Expansion and Confirmation")
        self.assertGreaterEqual(len(brief["chartReferenceFrames"]), 2)
        self.assertTrue(all(frame["framePath"].startswith("frames/") for frame in brief["chartReferenceFrames"]))


if __name__ == "__main__":
    unittest.main()
