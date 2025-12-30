"""
Simple harness for running MCP scripts.
"""

import sys
from pathlib import Path

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python -m runtime.harness <script_path> [args...]", file=sys.stderr)
        sys.exit(1)

    script_path = Path(sys.argv[1])

    if not script_path.exists():
        print(f"Error: Script not found: {script_path}", file=sys.stderr)
        sys.exit(1)

    # Remove the script path from sys.argv so the script sees clean args
    sys.argv = [str(script_path)] + sys.argv[2:]

    # Execute the script
    with open(script_path, 'r') as f:
        code = compile(f.read(), str(script_path), 'exec')
        exec(code, {'__name__': '__main__', '__file__': str(script_path)})
