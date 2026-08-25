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


def test_render_yaml_applies_theme_overrides():
    classic = renderer.render_yaml(MINIMAL_YAML, theme="classic")
    moderncv = renderer.render_yaml(MINIMAL_YAML, theme="moderncv")

    assert classic["success"] is True
    assert moderncv["success"] is True
    assert classic["files"]["typst"] != moderncv["files"]["typst"]


def test_render_yaml_with_theme_override():
    result = renderer.render_yaml(MINIMAL_YAML, theme="moderncv")
    assert result["success"] is True
    assert result["files"]["pdf"].startswith("data:application/pdf;base64,")


def _assert_renders(name: str, yaml_text: str):
    result = renderer.render_yaml(yaml_text)
    assert result["success"] is True, f"{name} failed: {result['error']}"


def test_form_shaped_skills_render():
    _assert_renders(
        "skills",
        """locale:
  language: mandarin_chinese
cv:
  name: Test
  sections:
    技能:
      - label: Languages
        details: Python, Go
""",
    )


def test_form_shaped_publications_render():
    _assert_renders(
        "publications",
        """locale:
  language: mandarin_chinese
cv:
  name: Test
  sections:
    论文发表:
      - title: A Paper
        authors: [Alice, Bob]
        journal: Nature
        date: 2024
        url: https://example.com
""",
    )


def test_form_shaped_awards_render():
    _assert_renders(
        "awards",
        """locale:
  language: mandarin_chinese
cv:
  name: Test
  sections:
    荣誉奖项:
      - name: Best Award
        date: 2024-05
""",
    )


def test_form_shaped_projects_render():
    _assert_renders(
        "projects",
        """locale:
  language: mandarin_chinese
cv:
  name: Test
  sections:
    项目经历:
      - name: My Project
        summary: "[项目链接](https://example.com)"
        start_date: 2020-01
        end_date: 2020-06
""",
    )


def test_invalid_form_shapes_return_structured_errors():
    result = renderer.render_yaml("""cv:
  name: Test
  sections:
    技能:
      - label: Languages
        items: Python, Go
""")
    assert result["success"] is False
    assert result["errors"]
    assert any(
        error["schema_location"] == ["cv", "sections", "技能", "0", "details"]
        for error in result["errors"]
    )
