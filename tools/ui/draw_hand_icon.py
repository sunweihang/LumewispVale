#!/usr/bin/env python3
"""LEGACY entry — hotbar tools (incl. hand) are drawn by draw_tool_icons.py.

  /usr/bin/python3 tools/ui/draw_tool_icons.py
"""

import runpy
from pathlib import Path

if __name__ == "__main__":
    runpy.run_path(str(Path(__file__).with_name("draw_tool_icons.py")), run_name="__main__")
