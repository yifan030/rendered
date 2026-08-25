"""Run the pure frontend editor-model unit tests (node:test) via pytest.

Why:
    The form/design field mapping lives in web_ui/static/editor-model.js so it
    can be unit-tested without a browser. This wrapper runs that test suite
    with Node's built-in test runner and fails if any assertion breaks.
"""

import pathlib
import shutil
import subprocess

import pytest

# Resolve against this file so the test is immune to os.chdir() pollution
# from other suites (several CLI/design tests chdir into tmp dirs).
FRONTEND_DIRECTORY = (
    pathlib.Path(__file__).resolve().parent.parent.parent / "web_ui" / "static"
)


def test_editor_model_unit_tests_pass() -> None:
    node = shutil.which("node")
    if not node:
        pytest.skip("node is not available")

    result = subprocess.run(
        [node, "--test", str(FRONTEND_DIRECTORY / "editor-model.test.mjs")],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, f"{result.stdout}\n{result.stderr}"
