"""Tests for the FastAPI backend."""

from fastapi.testclient import TestClient

from rendercv.schema.models.design.built_in_design import available_themes
from web_ui.main import app

client = TestClient(app)


def test_themes_endpoint():
    response = client.get("/api/themes")
    assert response.status_code == 200
    data = response.json()
    assert "themes" in data
    assert any(t["id"] == "classic" for t in data["themes"])


def test_themes_match_available_themes():
    response = client.get("/api/themes")
    ids = [t["id"] for t in response.json()["themes"]]
    assert ids == available_themes


def test_sample_endpoint():
    response = client.get("/api/sample")
    assert response.status_code == 200
    data = response.json()
    assert "yaml" in data


def test_render_endpoint():
    yaml_text = """cv:
  name: Bob
  sections:
    Experience:
      - Software Engineer at Company X, 2020-2023
"""
    response = client.post("/api/render", json={"yaml": yaml_text, "theme": "classic"})
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["files"]["pdf"].startswith("data:application/pdf;base64,")
    assert len(data["files"]["png"]) >= 1


def test_render_returns_structured_errors():
    yaml_text = """cv:
  name: Bob
  sections:
    技能:
      - label: Languages
        items: Python
"""
    response = client.post("/api/render", json={"yaml": yaml_text})
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is False
    assert data["error"]
    assert any(
        error["schema_location"] == ["cv", "sections", "技能", "0", "details"]
        for error in data["errors"]
    )


def test_parse_yaml_endpoint():
    yaml_text = """cv:
  name: Bob
  sections:
    Experience:
      - Software Engineer at Company X, 2020-2023
"""
    response = client.post("/api/parse-yaml", json={"yaml": yaml_text})
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["data"]["cv"]["name"] == "Bob"
    assert (
        data["data"]["cv"]["sections"]["Experience"][0]
        == "Software Engineer at Company X, 2020-2023"
    )


def test_parse_yaml_keeps_date_strings():
    """Dates like YYYY-MM-DD must stay strings, not become date objects."""
    yaml_text = """cv:
  name: Bob
  sections:
    教育经历:
      - institution: MIT
        start_date: 2018-09-01
"""
    response = client.post("/api/parse-yaml", json={"yaml": yaml_text})
    data = response.json()
    assert data["data"]["cv"]["sections"]["教育经历"][0]["start_date"] == "2018-09-01"


def test_serialize_yaml_round_trip():
    yaml_text = """locale:
  language: mandarin_chinese
cv:
  name: 张三
  sections:
    技能:
      - label: Languages
        details: Python, Go
    工作经历:
      - company: Acme
        position: Engineer
        start_date: 2020-01
        end_date: present
"""
    parsed = client.post("/api/parse-yaml", json={"yaml": yaml_text}).json()["data"]
    serialized = client.post("/api/serialize-yaml", json={"data": parsed}).json()[
        "yaml"
    ]
    reparsed = client.post("/api/parse-yaml", json={"yaml": serialized}).json()["data"]
    assert reparsed == parsed


def test_serialize_yaml_preserves_unknown_keys():
    """Fields the form does not manage must survive a serialize round trip."""
    data = {
        "cv": {
            "name": "Bob",
            "photo": "photo.jpg",
            "custom_connections": [
                {"placeholder": "Book a call", "url": "https://x.com"}
            ],
        },
        "design": {"theme": "opal", "colors": {"name": "rgb(1, 2, 3)"}},
        "custom_top_level": {"anything": True},
    }
    serialized = client.post("/api/serialize-yaml", json={"data": data}).json()["yaml"]
    reparsed = client.post("/api/parse-yaml", json={"yaml": serialized}).json()["data"]
    assert reparsed == data


def test_design_endpoint():
    response = client.get("/api/design/classic")
    assert response.status_code == 200
    design = response.json()["design"]
    assert design["page"]["size"] == "us-letter"
    assert design["theme"] == "classic"
    assert design["colors"]["name"] == "rgb(0, 79, 144)"


def test_design_endpoint_theme_variants_differ():
    classic = client.get("/api/design/classic").json()["design"]
    opal = client.get("/api/design/opal").json()["design"]
    assert classic["colors"]["name"] != opal["colors"]["name"]


def test_design_endpoint_unknown_theme():
    response = client.get("/api/design/not-a-theme")
    assert response.status_code == 404
