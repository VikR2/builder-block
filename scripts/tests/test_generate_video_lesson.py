import importlib.util
import tempfile
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "generate_video_lesson.py"
SPEC = importlib.util.spec_from_file_location("generate_video_lesson", SCRIPT_PATH)
assert SPEC and SPEC.loader
lesson = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(lesson)


class GenerateVideoLessonTests(unittest.TestCase):
    def test_clean_transcript_text_strips_filler_heavy_opening(self) -> None:
        cleaned = lesson.clean_transcript_text(
            "All right, you know, so book building starts once submitted orders begin matching inside the window."
        )

        self.assertFalse(cleaned.lower().startswith("all right"))
        self.assertFalse(cleaned.lower().startswith("you know"))
        self.assertIn("book building starts", cleaned.lower())

    def test_load_relevant_study_sections_filters_tables_and_metadata(self) -> None:
        original_dir = lesson.ARCHITECTURES_DIR

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            lesson.ARCHITECTURES_DIR = temp_path
            (temp_path / "order-fulfillment.md").write_text(
                "\n".join([
                    "# TCM Order Fulfillment Tips",
                    "",
                    "## Book Formation",
                    "Book building only becomes actionable after matching starts and liquidity begins to organize.",
                    "",
                    "## Skills to Extract",
                    "| Name | Description |",
                    "| --- | --- |",
                    "| Book Building | Internal skill taxonomy row |",
                    "",
                    "## Relationship to Existing TCM Skills",
                    "**Source:** Internal mapping",
                ]),
                encoding="utf-8",
            )

            try:
                sections = lesson.load_relevant_study_sections("Order Fulfillment Tips")
            finally:
                lesson.ARCHITECTURES_DIR = original_dir

        self.assertEqual([section["title"] for section in sections], ["Book Formation"])
        self.assertTrue(all(section["type"] == "explanation" for section in sections))
        self.assertNotIn("Skills to Extract", [section["title"] for section in sections])

    def test_validate_lesson_payload_flags_low_signal_and_quote_like_content(self) -> None:
        payload = {
            "summary": "All right, so today we're going to look at the trays and kind of talk through it.",
            "keyTakeaways": [
                "All right, so the trays matter.",
                "You know, the matching window is where it all happens.",
                "This is important."
            ],
            "suggestedQuestions": [
                "Can you explain all right, so today we're going to look at the trays in simpler terms?",
                "When should I pay attention to you know, the matching window?",
                "How do I trade this?",
                "What matters most here?"
            ],
            "sections": [
                {
                    "title": "All right so what was on your mind",
                    "summary": "All right, so today we're going to look at the trays and kind of talk through it.",
                    "transcriptExcerpt": "All right, so today we're going to look at the trays and kind of talk through it."
                },
                {
                    "title": "Book Formation",
                    "summary": "You know, this is where the orders are.",
                    "transcriptExcerpt": "You know, this is where the orders are."
                },
                {
                    "title": "Matching Window",
                    "summary": "The window is where they match.",
                    "transcriptExcerpt": "The window is where they match."
                }
            ]
        }

        quality = lesson.validate_lesson_payload(payload)

        self.assertFalse(quality["valid"])
        self.assertIn("summary_low_signal", quality["flags"])
        self.assertIn("takeaway_low_signal", quality["flags"])
        self.assertIn("question_low_signal", quality["flags"])
        self.assertIn("section_title_fragment", quality["flags"])
        self.assertIn("section_summary_quote_like", quality["flags"])

    def test_build_deterministic_lesson_generates_tutor_pack_and_questions(self) -> None:
        seeds = [
            {
                "title": "Submission Range and Matching Window",
                "startTime": 120.0,
                "endTime": 210.0,
                "timestampLabel": "2:00",
                "studySummary": "The submission range matters before matching starts, but the trade only becomes actionable once the matching window begins.",
                "transcriptExcerpt": "The mentor explains that you first map the submitted orders, then wait for matching to reveal the actual book.",
            },
            {
                "title": "Book Formation and Liquidity",
                "startTime": 300.0,
                "endTime": 360.0,
                "timestampLabel": "5:00",
                "studySummary": "Book formation shows where liquidity is actually organizing and where EQ can become meaningful.",
                "transcriptExcerpt": "This is where the book starts to form and liquidity becomes readable instead of theoretical.",
            },
        ]

        payload = lesson.build_deterministic_lesson("Order Fulfillment Tips", seeds)

        self.assertGreaterEqual(len(payload["keyTakeaways"]), 2)
        self.assertGreaterEqual(len(payload["suggestedQuestions"]), 4)
        self.assertIn("tutorPack", payload)
        self.assertTrue(
            all(not item.lower().startswith(("all right", "you know", "so ")) for item in payload["keyTakeaways"])
        )
        self.assertTrue(
            all(not question.lower().startswith(("all right", "you know", "so ")) for question in payload["suggestedQuestions"])
        )
        self.assertIn("Submission Range and Matching Window", payload["summary"])

        tutor_pack = payload["tutorPack"]
        self.assertIn("mentorApproach", tutor_pack)
        self.assertGreaterEqual(len(tutor_pack["coreConcepts"]), 2)
        self.assertGreaterEqual(len(tutor_pack["diagnosticQuestions"]), 4)
        self.assertGreaterEqual(len(tutor_pack["practicePrompts"]), 3)
        self.assertGreaterEqual(len(tutor_pack["glossary"]), 3)
        self.assertTrue(
            any("actionable liquidity" in item.lower() for item in tutor_pack["commonMisconceptions"])
        )


if __name__ == "__main__":
    unittest.main()
