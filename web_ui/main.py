"""FastAPI backend for the RenderCV web UI."""

import pathlib

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from web_ui.renderer import render_yaml

app = FastAPI(title="RenderCV Web UI")

THEMES = [
    {"id": "classic", "name": "Classic"},
    {"id": "moderncv", "name": "Moderncv"},
    {"id": "sb2nov", "name": "Sb2nov"},
    {"id": "engineeringresumes", "name": "Engineeringresumes"},
    {"id": "engineeringclassic", "name": "Engineeringclassic"},
    {"id": "harvard", "name": "Harvard"},
    {"id": "ember", "name": "Ember"},
    {"id": "ink", "name": "Ink"},
    {"id": "opal", "name": "Opal"},
]

SAMPLE_YAML = """cv:
  name: John Doe
  location: San Francisco, CA
  email: john.doe@email.com
  website: https://rendercv.com
  social_networks:
    - network: LinkedIn
      username: rendercv
    - network: GitHub
      username: rendercv
  sections:
    summary:
      - RenderCV reads a CV written in a YAML file, and generates a PDF with professional typography.
    experience:
      - company: Example Inc.
        position: Software Engineer
        start_date: 2020-01
        end_date: present
        location: San Francisco, CA
        highlights:
          - Built scalable backend services.
    education:
      - institution: Stanford University
        degree: MS
        area: Computer Science
        start_date: 2018-09
        end_date: 2020-06
        location: Stanford, CA
"""


class RenderRequest(BaseModel):
    """Request body for the /api/render endpoint."""

    yaml: str
    theme: str | None = None


@app.get("/api/themes")
def get_themes():
    """Return the list of built-in RenderCV themes."""
    return {"themes": THEMES}


@app.get("/api/sample")
def get_sample():
    """Return a sample CV YAML string."""
    return {"yaml": SAMPLE_YAML}


@app.post("/api/render")
def render_endpoint(request: RenderRequest):
    """Render the provided YAML and return generated files."""
    return render_yaml(request.yaml, request.theme)


static_dir = pathlib.Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
