#!/usr/bin/env python3
"""Test YouTube transcript fetching"""

import json
import subprocess
import sys

def test_fetch(url):
    """Test fetching transcript from YouTube"""
    try:
        result = subprocess.run(
            ['npx', '--yes', 'node', '.claude/mcp-servers/youtube-transcript/fetch.js', url],
            capture_output=True,
            text=True,
            timeout=60
        )

        if result.returncode != 0:
            print(f"Error: {result.stdout or result.stderr}")
            return None

        data = json.loads(result.stdout)

        if 'error' in data:
            print(f"Error from transcript API: {data['error']}")
            return None

        print(f"Success! Fetched {data['character_count']} characters")
        print(f"Segments: {data['segments']}")
        print(f"Duration: {data['duration_seconds']} seconds")

        if data['character_count'] > 0:
            preview = data['transcript'][:200]
            print(f"\nPreview: {preview}...")

        return data

    except Exception as e:
        print(f"Exception: {e}")
        return None

if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else "https://www.youtube.com/watch?v=-KKuZb5Z5aU"
    print(f"Testing with: {url}\n")
    test_fetch(url)
