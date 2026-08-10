#!/usr/bin/env python3
"""LEGACY entry — ad icon is AI-sourced, not procedural.

  /usr/bin/python3 tools/ui/process_ad_icon_ai.py
"""

import runpy
from pathlib import Path

if __name__ == "__main__":
    runpy.run_path(str(Path(__file__).with_name("process_ad_icon_ai.py")), run_name="__main__")
