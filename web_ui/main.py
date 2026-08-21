"""FastAPI backend for the RenderCV web UI."""

import pathlib

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from ruamel.yaml import YAML

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

SAMPLE_YAML = """locale:
  language: mandarin_chinese

cv:
  name: 张三
  location: 北京
  email: zhangsan@example.com
  phone: +86 138 0000 0000
  website: https://example.com
  social_networks:
    - network: LinkedIn
      username: zhangsan
    - network: GitHub
      username: zhangsan
  sections:
    个人简介:
      - 我是一名软件工程师，擅长后端开发与团队协作。
    工作经历:
      - company: 科技有限公司
        position: 软件工程师
        start_date: 2020-01
        end_date: present
        location: 北京
        highlights:
          - 开发核心后端服务
          - 带领 5 人团队完成重点项目
    教育经历:
      - institution: 清华大学
        degree: 硕士
        area: 计算机科学与技术
        start_date: 2018-09
        end_date: 2020-06
        location: 北京
"""


class RenderRequest(BaseModel):
    """Request body for the /api/render endpoint."""

    yaml: str
    theme: str | None = None


class ParseYamlRequest(BaseModel):
    """Request body for the /api/parse-yaml endpoint."""

    yaml: str


def _to_plain(obj):
    """Recursively convert ruamel.yaml CommentedMap/Seq to plain dict/list."""
    if isinstance(obj, dict):
        return {k: _to_plain(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_to_plain(v) for v in obj]
    return obj


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


@app.post("/api/parse-yaml")
def parse_yaml_endpoint(request: ParseYamlRequest):
    """Parse a YAML string into plain JSON for form population."""
    yaml = YAML()
    data = yaml.load(request.yaml)
    return {"data": _to_plain(data)}


static_dir = pathlib.Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
