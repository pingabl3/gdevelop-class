"""Scan projects/ for GDevelop game.json files and write projects.json.

Run by the GitHub Action on every push. Each project folder becomes one
"Open in GDevelop" card on the class page.
"""
import json
import os
import subprocess
import sys
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
PROJECTS_DIR = ROOT / "projects"

repo = os.environ.get("GITHUB_REPOSITORY", "OWNER/REPO")
branch = os.environ.get("GITHUB_REF_NAME", "main")
raw_base = f"https://raw.githubusercontent.com/{repo}/{branch}/"

def last_changed(folder: Path) -> str:
    """Date of the last commit touching this folder (needs full git history)."""
    try:
        return subprocess.run(
            ["git", "log", "-1", "--format=%cI", "--", str(folder)],
            cwd=ROOT, capture_output=True, text=True, check=True,
        ).stdout.strip()
    except Exception:
        return ""


projects = []
for game_json in sorted(PROJECTS_DIR.rglob("*.json")):
    try:
        data = json.loads(game_json.read_text(encoding="utf-8"))
    except Exception:
        continue
    # Only real GDevelop project files (not other JSON that might be lying around).
    if not isinstance(data, dict) or "gdVersion" not in data or "layouts" not in data:
        continue
    props = data.get("properties", {})
    rel = game_json.relative_to(ROOT).as_posix()
    folder = game_json.parent.relative_to(PROJECTS_DIR).as_posix()
    projects.append(
        {
            "name": props.get("name") or folder,
            "description": props.get("description", ""),
            "folder": folder,
            "scenes": len(data.get("layouts", [])),
            "updated": last_changed(game_json.parent),
            "projectUrl": raw_base + quote(rel),
        }
    )

# Newest first.
projects.sort(key=lambda p: p["updated"], reverse=True)

out ={"repo": repo, "branch": branch, "projects": projects}
(ROOT / "projects.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
print(f"Found {len(projects)} project(s)", file=sys.stderr)
