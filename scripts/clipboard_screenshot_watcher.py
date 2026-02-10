#!/usr/bin/env python3
"""
Clipboard Screenshot Watcher

Monitors clipboard for new images (from Win+Shift+S or any screenshot tool)
and saves them to a specified folder.

Usage:
    python clipboard_screenshot_watcher.py <output_folder> [--interval SECONDS] [--prefix PREFIX]

Examples:
    /c/Users/satvi/Repos/builder-block-C/scripts
    python clipboard_screenshot_watcher.py ./screenshots
    python clipboard_screenshot_watcher.py ./screenshots --interval 0.5 --prefix chart_
    python scripts/clipboard_screenshot_watcher.py ../screenshots
"""

import argparse
import hashlib
import os
import signal
import sys
import time

# Force unbuffered output
sys.stdout.reconfigure(line_buffering=True) if hasattr(sys.stdout, 'reconfigure') else None
os.environ['PYTHONUNBUFFERED'] = '1'
from datetime import datetime
from pathlib import Path
from typing import Optional

try:
    from PIL import Image, ImageGrab
except ImportError:
    print("Error: Pillow required. Install with: pip install Pillow")
    sys.exit(1)


class ClipboardWatcher:
    """Watches clipboard for new images and saves them to a folder."""

    def __init__(
        self,
        output_folder: Path,
        interval: float = 0.3,
        prefix: str = "screenshot_",
        cooldown: float = 1.5,
    ):
        self.output_folder = output_folder
        self.interval = interval
        self.prefix = prefix
        self.cooldown = cooldown
        self.last_hash: Optional[str] = None
        self.last_save_time: float = 0
        self.running = False
        self.saved_count = 0

    def _get_image_hash(self, img: Image.Image) -> str:
        """Generate hash of raw pixel data for comparison."""
        return hashlib.md5(img.tobytes()).hexdigest()

    def _get_clipboard_image(self) -> Optional[Image.Image]:
        """Get image from clipboard if available."""
        try:
            img = ImageGrab.grabclipboard()
            if isinstance(img, Image.Image):
                return img
        except Exception:
            pass
        return None

    def _save_image(self, img: Image.Image) -> Path:
        """Save image to output folder with timestamp."""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
        filename = f"{self.prefix}{timestamp}.png"
        filepath = self.output_folder / filename
        img.save(filepath, "PNG", optimize=True)
        return filepath

    def check_and_save(self) -> Optional[Path]:
        """Check clipboard and save if new image found."""
        # Cooldown check - skip if saved recently
        if time.time() - self.last_save_time < self.cooldown:
            return None

        img = self._get_clipboard_image()
        if img is None:
            return None

        img_hash = self._get_image_hash(img)
        if img_hash == self.last_hash:
            return None

        self.last_hash = img_hash
        self.last_save_time = time.time()
        filepath = self._save_image(img)
        self.saved_count += 1
        return filepath

    def run(self) -> None:
        """Main watch loop."""
        self.running = True
        print(f"Watching clipboard for screenshots...", flush=True)
        print(f"Output folder: {self.output_folder.absolute()}", flush=True)
        print(f"Poll interval: {self.interval}s", flush=True)
        print("Press Ctrl+C to stop\n", flush=True)

        # Initialize with current clipboard to avoid saving existing image
        self._get_clipboard_image()
        if img := self._get_clipboard_image():
            self.last_hash = self._get_image_hash(img)

        while self.running:
            try:
                if filepath := self.check_and_save():
                    print(f"[{self.saved_count}] Saved: {filepath.name}", flush=True)
                time.sleep(self.interval)
            except KeyboardInterrupt:
                break

        print(f"\nStopped. Total screenshots saved: {self.saved_count}")

    def stop(self) -> None:
        """Stop the watch loop."""
        self.running = False


def main():
    parser = argparse.ArgumentParser(
        description="Watch clipboard for screenshots and save to folder",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "output_folder",
        type=Path,
        help="Folder to save screenshots to",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=0.3,
        help="Clipboard check interval in seconds (default: 0.3)",
    )
    parser.add_argument(
        "--prefix",
        type=str,
        default="screenshot_",
        help="Filename prefix (default: screenshot_)",
    )

    args = parser.parse_args()

    # Ensure output folder exists
    args.output_folder.mkdir(parents=True, exist_ok=True)

    watcher = ClipboardWatcher(
        output_folder=args.output_folder,
        interval=args.interval,
        prefix=args.prefix,
    )

    # Handle graceful shutdown
    def signal_handler(sig, frame):
        watcher.stop()

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    watcher.run()


if __name__ == "__main__":
    main()
