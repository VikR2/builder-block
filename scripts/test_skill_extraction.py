#!/usr/bin/env python3
"""
Test script for skill extraction pipeline using a mock transcript.
"""

import sys
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from scripts.generate_from_youtube import (
    analyze_concepts,
    find_new_vs_existing_skills,
    extract_skill_from_concept,
    save_new_skills,
    resolve_all_dependencies,
    record_video_processed,
    get_relevant_skills,
    classify_content_type,
    generate_code,
    save_file,
    save_to_database,
    DEFAULT_OUTPUT_DIR,
)

# Mock trading transcript about ICT concepts
MOCK_TRANSCRIPT = """
Welcome back traders. Today we're going to discuss the liquidity sweep and how to trade it effectively.

First, let's understand what a liquidity sweep is. When price moves above or below equal highs or equal lows,
it's grabbing liquidity from stop losses placed at those levels. This is often called a stop hunt.

After the sweep, we look for a break of structure or BOS. This confirms the direction change.
The change of character or CHOCH is similar but occurs after a trend.

Next, we identify the order block. An order block is the last candle before a significant move.
Look for bullish order blocks in uptrends and bearish order blocks in downtrends.

For entry, we wait for price to return to the order block. We also look for fair value gaps or FVG,
which are imbalances in price that often get filled.

Risk management is critical. Place your stop loss below the order block for longs.
Your take profit should be at least 2:1 risk reward ratio. Consider trailing your stop to breakeven
after price moves in your favor.

The best sessions to trade are London and New York when volatility is highest.
Look for higher highs and higher lows in uptrends, lower highs and lower lows in downtrends.

Remember to check VWAP and volume profile for additional confluence.
The point of control or POC shows where most trading occurred.

That's the complete sweep reversal strategy. Practice in demo before going live!
"""

MOCK_URL = "https://youtube.com/watch?v=MOCK_VIDEO_TEST"


def main():
    print("=" * 60)
    print("Testing Skill Extraction Pipeline (Mock Transcript)")
    print("=" * 60)

    # Track results
    skills_extracted = []
    skills_matched = []

    # Step 2: Analyze concepts
    print("\n[2/10] Analyzing trading concepts...")
    concepts = analyze_concepts(MOCK_TRANSCRIPT)

    # Step 3: Get relevant existing skills
    print("\n[3/10] Searching for matching skills...")
    try:
        skills = get_relevant_skills(concepts)
        skills_matched = [s.get("id") for s in skills if s.get("id")]
        print(f"  Found {len(skills)} skill matches")
    except Exception as e:
        print(f"  Warning: Could not search skills: {e}")
        skills = []

    # Step 3a: Check new vs existing
    print("\n[3a/10] Checking for new vs existing skills...")
    try:
        skill_analysis = find_new_vs_existing_skills(concepts, MOCK_TRANSCRIPT)
        print(f"  New skills to create: {len(skill_analysis['new_skills'])}")
        print(f"  Existing to update: {len(skill_analysis['existing_skills'])}")
        print(f"  Ambiguous: {len(skill_analysis['ambiguous'])}")
        print(f"  Skip (exact match): {len(skill_analysis['skip'])}")
    except Exception as e:
        print(f"  Warning: Could not analyze skills: {e}")
        skill_analysis = {"new_skills": [], "existing_skills": [], "ambiguous": [], "skip": []}

    # Step 3b: Show what would be extracted
    if skill_analysis["new_skills"]:
        print("\n  New skills that would be created:")
        for concept in skill_analysis["new_skills"][:5]:
            skill_data = extract_skill_from_concept(concept, MOCK_TRANSCRIPT, MOCK_URL)
            print(f"    - {skill_data['name']} ({skill_data['category']})")
            print(f"      Keywords: {', '.join(skill_data['keywords'][:3])}")

    # Step 3c: Save new skills (if any)
    if skill_analysis["new_skills"]:
        print("\n[3c/10] Saving new skills...")
        try:
            saved_ids = save_new_skills(
                skill_analysis["new_skills"][:3],  # Limit to 3 for test
                MOCK_TRANSCRIPT,
                MOCK_URL,
                confirm=False,
            )
            skills_extracted = saved_ids
        except Exception as e:
            print(f"  Warning: Could not save skills: {e}")

    # Step 4: Classify content type
    print("\n[4/10] Classifying content type...")
    content_type = classify_content_type(MOCK_TRANSCRIPT, concepts, "auto")

    # Step 5: Generate code
    print("\n[5/10] Generating code...")
    code, filename = generate_code(content_type, concepts, skills, MOCK_URL)

    # Step 6: Save file
    print("\n[6/10] Saving file...")
    file_path = save_file(code, filename, content_type, DEFAULT_OUTPUT_DIR)

    # Step 7: Save to database
    print("\n[7/10] Saving to database...")
    try:
        name = filename.replace(".cs", "")
        description = f"Test {content_type} from mock transcript"
        script_id = save_to_database(
            1,  # project_id
            name,
            description,
            file_path,
            MOCK_URL,
            concepts,
            skills,
        )
    except Exception as e:
        print(f"  Warning: Could not save to database: {e}")
        script_id = 0

    # Step 10: Record video processing
    print("\n[10/10] Recording video processing...")
    try:
        record_id = record_video_processed(
            MOCK_URL,
            "Mock Trading Video Test",
            skills_extracted,
            skills_matched,
        )
    except Exception as e:
        print(f"  Warning: Could not record: {e}")
        record_id = 0

    # Summary
    print()
    print("=" * 60)
    print(f"  {content_type.upper()} generated successfully!")
    print("=" * 60)
    print()
    print(f"File: {file_path}")
    print(f"Type: {content_type}")
    print(f"Database ID: {script_id}")
    print(f"New skills saved: {len(skills_extracted)}")
    print(f"Existing skills used: {len(skills_matched)}")
    print(f"Video record ID: {record_id}")
    print()
    print("Concepts detected:")
    for category, keywords in concepts.items():
        print(f"  {category}: {', '.join(keywords[:5])}")


if __name__ == "__main__":
    main()
