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
import re
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


def image_score(url: str) -> float:
    """How interesting a screenshot looks: blank, black or loading screens score low."""
    try:
        from io import BytesIO
        from PIL import Image, ImageStat

        req = urllib.request.Request(url, headers={"User-Agent": "gdevelop-class-page"})
        with urllib.request.urlopen(req, timeout=15) as res:
            img = Image.open(BytesIO(res.read())).convert("RGB")
        img.thumbnail((160, 160))
        detail = sum(ImageStat.Stat(img).stddev) / 3  # contrast / detail
        colours = len(img.getcolors(img.width * img.height)) / (img.width * img.height)  # variety of colours
        return detail + 60 * colours
    except Exception as e:
        print(f"Could not score {url}: {e}", file=sys.stderr)
        return 0.0


UUID_RE = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")


def resolve_slug(slug: str) -> str:
    """Turn a gd.games/<user>/<game> link into the game ID, using the public game page."""
    url = f"https://gd.games/{slug}"
    req = urllib.request.Request(url, headers={"User-Agent": "gdevelop-class-page"})
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            html = res.read().decode("utf-8", "replace")
    except Exception as e:
        print(f"Could not open {url}: {e}", file=sys.stderr)
        return ""
    # The page's preview image lives under public-game-resources.gdevelop.io/<game id>/
    m = re.search(r"public-game-resources\.gdevelop\.io/(" + UUID_RE.pattern + ")/", html)
    if m:
        return m.group(1)
    ids = UUID_RE.findall(html)
    return max(set(ids), key=ids.count) if ids else ""


games = []
seen = set()
for entry in config.get("games", []):
    key = entry.get("id") or entry.get("slug", "")
    game_id = entry.get("id") or (resolve_slug(entry["slug"]) if entry.get("slug") else "")
    if game_id in seen:
        continue
    seen.add(game_id)
    info = fetch_game(game_id) if game_id else {}
    shots = info.get("screenshotUrls") or []
    own_thumb = info.get("thumbnailUrl") or ""
    options = ([own_thumb] if own_thumb else []) + shots
    chosen = entry.get("thumbnail", "")
    if chosen and chosen in options:
        thumbnail = chosen
    elif own_thumb:
        thumbnail = own_thumb  # thumbnail the student set in GDevelop
    elif len(shots) > 1:
        thumbnail = max(shots, key=image_score)
    else:
        thumbnail = shots[0] if shots else ""
    if info.get("userSlug") and info.get("gameSlug"):
        play_url = f"https://gd.games/{info['userSlug']}/{info['gameSlug']}"
    elif entry.get("slug"):
        play_url = f"https://gd.games/{entry['slug']}"
    else:
        play_url = f"https://gd.games/games/{game_id}"
    games.append(
        {
            "key": key,
            "id": game_id,
            "title": entry.get("title") or info.get("gameName") or "Untitled game",
            "originalTitle": info.get("gameName") or "",
            "caption": entry.get("caption", ""),
            "description": info.get("description") or "",
            "thumbnail": thumbnail,
            "thumbnailChosen": bool(chosen and chosen in options),
            "screenshots": options,
            "playUrl": play_url,
            "available": bool(info),
            "added": entry.get("added", ""),
        }
    )

(ROOT / "games.json").write_text(json.dumps({"games": games}, indent=2), encoding="utf-8")
print(f"Found {len(games)} game(s)", file=sys.stderr)
