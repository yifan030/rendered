"""RenderCV rendering wrapper for the web UI."""

import base64
import pathlib
import tempfile

from rendercv.exception import RenderCVUserValidationError, RenderCVValidationError
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


def validation_error_to_dictionary(error: RenderCVValidationError) -> dict:
    """Serialize a single validation error to a JSON-friendly dictionary.

    Args:
        error: A RenderCV validation error.

    Returns:
        A dictionary with ``schema_location``, ``yaml_location``, ``message``,
        and ``input`` keys for the frontend to display field-level errors.
    """
    schema_location = list(error.schema_location) if error.schema_location else None
    yaml_location = None
    if error.yaml_location:
        (start_line, start_column), (end_line, end_column) = error.yaml_location
        yaml_location = {
            "start_line": start_line,
            "start_column": start_column,
            "end_line": end_line,
            "end_column": end_column,
        }
    return {
        "schema_location": schema_location,
        "yaml_location": yaml_location,
        "message": error.message,
        "input": error.input,
    }


def render_yaml(yaml_text: str, theme: str | None = None) -> dict:
    """Render a YAML CV string into PDF, PNG, and Typst outputs.

    Args:
        yaml_text: The full RenderCV YAML source.
        theme: Optional theme override.

    Returns:
        A dictionary with keys ``success``, ``error``, ``errors``, and ``files``.
    """
    try:
        _, rendercv_model = build_rendercv_dictionary_and_model(
            yaml_text,
            overrides={"design.theme": theme} if theme else None,
        )
    except RenderCVUserValidationError as exc:
        errors = [
            validation_error_to_dictionary(error) for error in exc.validation_errors
        ]
        summary = "; ".join(error["message"] for error in errors) or str(exc)
        return {"success": False, "error": summary, "errors": errors, "files": {}}
    except Exception as exc:
        return {"success": False, "error": str(exc), "errors": [], "files": {}}

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
        except Exception as exc:
            return {"success": False, "error": str(exc), "errors": [], "files": {}}

        files = {
            "pdf": _to_data_uri(pdf_path, "application/pdf") if pdf_path else None,
            "png": [_to_data_uri(p, "image/png") for p in png_paths or []],
            "typst": typst_path.read_text(encoding="utf-8") if typst_path else None,
        }
        return {"success": True, "error": None, "errors": [], "files": files}
