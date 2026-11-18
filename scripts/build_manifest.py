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


# Names the teacher changed on the class page (folder -> name).
try:
    titles = json.loads((ROOT / "config.json").read_text(encoding="utf-8")).get("titles", {})
except Exception:
    titles = {}

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
            "name": titles.get(folder) or props.get("name") or folder,
            "originalName": props.get("name") or folder,
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


# ---------------------------------------------------------------------------
# Previous students' top games: the teacher lists gd.games IDs in config.json;
# fetch each game's name, description and screenshot from GDevelop's public API.
import urllib.request

try:
    config = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
except Exception:
    config = {}


def fetch_game(game_id: str) -> dict:
    url = f"https://api.gdevelop.io/game/public-game/{game_id}"
    req = urllib.request.Request(url, headers={"User-Agent": "gdevelop-class-page"})
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            return json.load(res)
    except Exception as e:
        print(f"Could not fetch game {game_id}: {e}", file=sys.stderr)
        return {}


games = []
for entry in config.get("games", []):
    game_id = entry.get("id", "")
    info = fetch_game(game_id)
    shots = info.get("screenshotUrls") or []
    games.append(
        {
            "id": game_id,
            "title": entry.get("title") or info.get("gameName") or "Untitled game",
            "originalTitle": info.get("gameName") or "",
            "caption": entry.get("caption", ""),
            "description": info.get("description") or "",
            "thumbnail": shots[0] if shots else "",
            "playUrl": f"https://gd.games/games/{game_id}",
            "available": bool(info),
            "added": entry.get("added", ""),
        }
    )

(ROOT / "games.json").write_text(json.dumps({"games": games}, indent=2), encoding="utf-8")
print(f"Found {len(games)} game(s)", file=sys.stderr)
