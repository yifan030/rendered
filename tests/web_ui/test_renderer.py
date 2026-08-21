"""Tests for the web UI renderer wrapper."""

import web_ui.renderer as renderer


MINIMAL_YAML = """cv:
  name: John Doe
  sections:
    Experience:
      - Software Engineer at Company X, 2020-2023
"""


def test_render_yaml_returns_success_for_sample():
    result = renderer.render_yaml(MINIMAL_YAML)
    assert result["success"] is True
    assert result["error"] is None
    assert result["files"]["pdf"].startswith("data:application/pdf;base64,")
    assert len(result["files"]["png"]) >= 1
    assert result["files"]["typst"] is not None


def test_render_yaml_returns_error_for_invalid_yaml():
    result = renderer.render_yaml("not: valid: yaml: [")
    assert result["success"] is False
    assert result["error"] is not None


def test_render_yaml_with_theme_override():
    result = renderer.render_yaml(MINIMAL_YAML, theme="moderncv")
    assert result["success"] is True
    assert result["files"]["pdf"].startswith("data:application/pdf;base64,")
