"""RenderCV rendering wrapper for the web UI."""

import base64
import pathlib
import tempfile

from rendercv.renderer.pdf_png import generate_pdf, generate_png
from rendercv.renderer.typst import generate_typst
from rendercv.schema.rendercv_model_builder import build_rendercv_dictionary_and_model


def _to_data_uri(path: pathlib.Path, mime: str) -> str:
    """Convert a file's contents to a base64 data URI.

    Args:
        path: Path to the file.
        mime: MIME type of the file.

    Returns:
        A data URI string.
    """
    data = path.read_bytes()
    b64 = base64.b64encode(data).decode("ascii")
    return f"data:{mime};base64,{b64}"


def render_yaml(yaml_text: str, theme: str | None = None) -> dict:
    """Render a YAML CV string into PDF, PNG, and Typst outputs.

    Args:
        yaml_text: The full RenderCV YAML source.
        theme: Optional theme override.

    Returns:
        A dictionary with keys ``success``, ``error``, and ``files``.
    """
    try:
        _, rendercv_model = build_rendercv_dictionary_and_model(yaml_text)
        if theme:
            rendercv_model.design.theme = theme
    except Exception as exc:  # noqa: BLE001
        return {"success": False, "error": str(exc), "files": {}}

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = pathlib.Path(tmp)
        try:
            # Force all output into the temporary directory.
            rendercv_model.settings.render_command.output_folder = tmp_path
            rendercv_model.settings.render_command.typst_path = tmp_path / "cv.typ"
            rendercv_model.settings.render_command.pdf_path = tmp_path / "cv.pdf"
            rendercv_model.settings.render_command.png_path = tmp_path / "cv.png"

            typst_path = generate_typst(rendercv_model)
            pdf_path = generate_pdf(rendercv_model, typst_path)
            png_paths = generate_png(rendercv_model, typst_path)
        except Exception as exc:  # noqa: BLE001
            return {"success": False, "error": str(exc), "files": {}}

        files = {
            "pdf": _to_data_uri(pdf_path, "application/pdf") if pdf_path else None,
            "png": [_to_data_uri(p, "image/png") for p in (png_paths or [])],
            "typst": typst_path.read_text(encoding="utf-8") if typst_path else None,
        }
        return {"success": True, "error": None, "files": files}
