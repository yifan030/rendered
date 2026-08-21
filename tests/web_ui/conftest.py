"""Make the repository root importable during web UI tests."""

import pathlib
import sys

REPO_ROOT = pathlib.Path(__file__).parent.parent.parent
sys.path.insert(0, str(REPO_ROOT))
