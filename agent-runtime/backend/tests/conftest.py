"""PromptCard runtime test configuration."""

import sys
import tempfile
from pathlib import Path

TEST_ROOT = Path(__file__).parent
TEMP_ROOT = TEST_ROOT.parent / "pytest-tmp"
TEMP_ROOT.mkdir(exist_ok=True)
tempfile.tempdir = str(TEMP_ROOT)

sys.path.insert(0, str(TEST_ROOT.parent))
