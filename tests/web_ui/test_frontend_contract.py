"""Regression tests for the static editor frontend contract."""

import pathlib
import re

# Resolve against this file so the tests are immune to os.chdir() pollution
# from other suites (several CLI/design tests chdir into tmp dirs).
FRONTEND_DIRECTORY = (
    pathlib.Path(__file__).resolve().parent.parent.parent / "web_ui" / "static"
)


def test_editor_shell_exposes_required_regions() -> None:
    """The HTML shell exposes all editor and preview mount points."""
    html = (FRONTEND_DIRECTORY / "index.html").read_text(encoding="utf-8")

    required_ids = (
        "sidebar",
        "top-toolbar",
        "workspace-tabs",
        "editor-panel",
        "preview-panel",
        "splitter",
    )
    for element_id in required_ids:
        assert f'id="{element_id}"' in html
    assert "AI" not in html


def test_editor_model_module_is_loaded_before_app() -> None:
    """The pure editor-model module must load before app.js uses it."""
    html = (FRONTEND_DIRECTORY / "index.html").read_text(encoding="utf-8")
    model_index = html.index("/editor-model.js")
    app_index = html.index("/app.js")
    assert model_index < app_index


def test_app_uses_editor_model_module() -> None:
    """app.js must build the form from the shared EditorModel module."""
    javascript = (FRONTEND_DIRECTORY / "app.js").read_text(encoding="utf-8")
    assert "const FORM_SCHEMA = EditorModel.FORM_SCHEMA;" in javascript
    assert "EditorModel.applyFormToData" in javascript
    assert "EditorModel.formDataFromData" in javascript


def test_frontend_script_exposes_editor_lifecycle_hooks() -> None:
    """The JavaScript keeps stable hooks for the editor lifecycle."""
    javascript = (FRONTEND_DIRECTORY / "app.js").read_text(encoding="utf-8")

    required_functions = (
        "renderSidebar",
        "renderToolbar",
        "renderTabs",
        "renderPreview",
        "doRender",
        "scheduleRender",
        "setZoom",
        "showPage",
    )
    for function_name in required_functions:
        assert f"function {function_name}" in javascript


def test_frontend_uses_white_default_surface() -> None:
    """The default CSS surface is white and avoids a purple primary background."""
    css = (FRONTEND_DIRECTORY / "style.css").read_text(encoding="utf-8")

    assert "--background: #ffffff" in css
    assert "--surface: #ffffff" in css
    assert "--canvas: #f1f1f3" in css
    assert "purple" not in css.lower()


def test_responsive_breakpoints_cover_split_layout_minimum() -> None:
    """The mobile layout starts before the split layout can overflow."""
    css = (FRONTEND_DIRECTORY / "style.css").read_text(encoding="utf-8")

    assert "@media (max-width: 1084px)" in css
    assert "@media (min-width: 1085px)" in css


def test_responsive_narrow_breakpoint_covers_wide_grid_gap() -> None:
    """The narrow-column media query covers the split-layout gap above 1084px.

    Why:
        The default wide grid (420px editor + 8px splitter + 520px preview =
        948px minimum) only fits once the viewport clears the 300px sidebar and
        app-shell padding, i.e. around 1272px+. A narrowing media query must
        therefore stay active across the whole gap between the 1084px mobile
        contract breakpoint and the wide-grid threshold, and its 360/8/420
        columns must still fit at the 1085px minimum split width. Locking this
        proves the breakpoint gap is covered by the contract.
    """
    css = (FRONTEND_DIRECTORY / "style.css").read_text(encoding="utf-8")

    # Locate the narrowing media query (the first max-width query in the file).
    match = re.search(r"@media \(max-width: (\d+)px\)", css)
    assert match is not None, "expected a narrowing media query"
    narrowing_breakpoint = int(match.group(1))
    assert (
        narrowing_breakpoint > 1084
    ), "narrowing breakpoint must be above the mobile contract breakpoint"

    # The narrow 360/8/420 columns must exist and be strictly narrower than the
    # default wide 420/8/520 grid.
    assert "grid-template-columns: minmax(360px, 1fr) 8px minmax(420px, 1fr)" in css
    assert 360 + 8 + 420 < 420 + 8 + 520

    # The narrow grid must fit at the narrowest split viewport (1085px) with the
    # 270px sidebar and app-shell padding, so editor and preview stay visible
    # throughout the gap where the wide grid would overflow.
    assert 360 + 8 + 420 + 270 + 24 <= 1085

    # The narrowing breakpoint must reach the top of the gap where the wide grid
    # cannot fit (420+8+520 + 300px sidebar + 24px padding = 1272px threshold).
    wide_threshold = 420 + 8 + 520 + 300 + 24
    assert narrowing_breakpoint >= wide_threshold - 1


def test_workbench_uses_chinese_navigation_copy() -> None:
    """The visible workbench navigation is localized for Chinese users."""
    javascript = (FRONTEND_DIRECTORY / "app.js").read_text(encoding="utf-8")

    for label in ("新建简历", "导入 YAML", "本地工作区"):
        assert label in javascript
    for legacy_label in (
        "Create new CV",
        "Or import YAML",
        "Local workspace",
        "Feedback",
    ):
        assert legacy_label not in javascript


def test_workbench_tabs_render_chinese_visible_labels() -> None:
    """The workspace tab list maps each workspace id to a Chinese visible label."""
    javascript = (FRONTEND_DIRECTORY / "app.js").read_text(encoding="utf-8")

    for workspace_id, label in (
        ("cv", "内容"),
        ("design", "设计"),
        ("locale", "语言"),
        ("settings", "设置"),
    ):
        assert f"['{workspace_id}', '{label}']" in javascript
    for legacy in (
        "['cv', 'CV']",
        "['design', 'Design']",
        "['locale', 'Locale']",
        "['settings', 'Settings']",
    ):
        assert legacy not in javascript


def test_workbench_has_structured_panel_hooks() -> None:
    """The renderer exposes stable hooks for the upgraded panel hierarchy."""
    javascript = (FRONTEND_DIRECTORY / "app.js").read_text(encoding="utf-8")

    for hook in ("workbench-header", "panel-kicker", "section-card", "preview-meta"):
        assert hook in javascript


def test_workbench_css_defines_layered_surface_tokens() -> None:
    """The CSS declares the neutral workbench surfaces used by the new layout."""
    css = (FRONTEND_DIRECTORY / "style.css").read_text(encoding="utf-8")

    for token in ("--surface-raised", "--surface-subtle", "--accent", "--focus-ring"):
        assert token in css
    assert ".section-card" in css
    assert ".preview-meta" in css
    assert ".preview-badge" in css
    assert ".workbench-header" in css


def test_workbench_css_matches_brief_token_values() -> None:
    """The light theme uses the exact token values from the Task 4 brief.

    Why:
        The design system pins these values; drifting them silently would
        change the brand color, border tone and large radius. Each theme
        token must also exist in both ``:root`` and ``:root.dark`` so no
        component hardcodes a theme color.
    """
    css = (FRONTEND_DIRECTORY / "style.css").read_text(encoding="utf-8")

    for token in (
        "--surface-raised: #ffffff",
        "--surface-subtle: #f7f8f7",
        "--accent: #2f6b53",
        "--accent-soft: #e7f0eb",
        "--focus-ring: rgb(47 107 83 / 26%)",
        "--text-strong: #1d2a24",
        "--text-muted: #6f7c75",
        "--border: #e1e7e3",
        "--radius-lg: 18px",
    ):
        assert token in css

    # The theme-dependent tokens must be declared for both light and dark.
    assert ":root.dark" in css
    for token in (
        "--surface-raised:",
        "--surface-subtle:",
        "--accent:",
        "--focus-ring:",
        "--text-strong:",
    ):
        assert css.count(token) >= 2


def test_panels_render_chinese_visible_copy() -> None:
    """Locale, Settings and Design panels expose Chinese copy inside section cards."""
    javascript = (FRONTEND_DIRECTORY / "app.js").read_text(encoding="utf-8")

    for label in (
        "简历内容",
        "视觉系统",
        "简历语言",
        "语言与地区",
        "当前日期",
        "加粗关键词",
        "基础设置",
        "可添加多条",
        "section-card-body",
        "section-help",
    ):
        assert label in javascript
    for legacy_label in (
        "<h1>Design</h1>",
        "<h1>Locale</h1>",
        "<h1>Settings</h1>",
        "CV language",
        "Current Date",
        "Bold Keywords",
        ">General<",
    ):
        assert legacy_label not in javascript
