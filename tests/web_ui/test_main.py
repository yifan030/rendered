"""Tests for the FastAPI backend."""

from fastapi.testclient import TestClient

from web_ui.main import app

client = TestClient(app)


def test_themes_endpoint():
    response = client.get("/api/themes")
    assert response.status_code == 200
    data = response.json()
    assert "themes" in data
    assert any(t["id"] == "classic" for t in data["themes"])


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
