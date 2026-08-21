"""Launcher for the RenderCV web UI."""

import uvicorn

if __name__ == "__main__":
    uvicorn.run("web_ui.main:app", host="127.0.0.1", port=8000, reload=True)
