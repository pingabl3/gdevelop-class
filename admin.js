// Teacher tools: add a GDevelop project from a .zip, or remove one.
// Talks only to api.github.com, using a token the teacher pastes in.
// Shared by index.html (browser) and the Node test script.

const API = 'https://api.github.com';

export function slugify(name) {
  const s = String(name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return s || 'project';
}

/**
 * Read a GDevelop "Download a copy" zip.
 * Returns { name, description, files: [{ path, base64 }] } with paths
 * relative to the folder that holds game.json.
 */
export async function readProjectZip(JSZip, data) {
  const zip = await JSZip.loadAsync(data);
  const entries = Object.values(zip.files).filter(
    f => !f.dir && !f.name.startsWith('__MACOSX/') && !/(^|\/)\.DS_Store$/.test(f.name)
  );

  // Find the project file: prefer game.json, otherwise any .json with gdVersion.
  const jsonEntries = entries
    .filter(f => f.name.toLowerCase().endsWith('.json'))
    .sort((a, b) => a.name.split('/').length - b.name.split('/').length);
  let projectEntry = null;
  let project = null;
  const ordered = [
    ...jsonEntries.filter(f => /(^|\/)game\.json$/i.test(f.name)),
    ...jsonEntries.filter(f => !/(^|\/)game\.json$/i.test(f.name)),
  ];
  for (const entry of ordered) {
    try {
      const parsed = JSON.parse(await entry.async('string'));
      if (parsed && parsed.gdVersion && parsed.layouts) {
        projectEntry = entry;
        project = parsed;
        break;
      }
    } catch (e) {
      /* not JSON we care about */
    }
  }
  if (!projectEntry) {
    throw new Error(
      "This zip doesn't contain a GDevelop project. In GDevelop use File → Save as → Download a copy."
    );
  }

  const root = projectEntry.name.includes('/')
    ? projectEntry.name.slice(0, projectEntry.name.lastIndexOf('/') + 1)
    : '';
  const files = [];
  for (const entry of entries) {
    if (!entry.name.startsWith(root)) continue;
    let path = entry.name.slice(root.length);
    if (entry === projectEntry) path = 'game.json';
    files.push({ path, base64: await entry.async('base64') });
  }
  const props = project.properties || {};
  return { name: props.name || 'Untitled project', description: props.description || '', files };
}

async function gh(token, method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = (await res.json()).message || msg;
    } catch (e) {}
    const err = new Error(`GitHub: ${msg} (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

/** Check the token can write to the repo. */
export async function checkToken(token, repo) {
  const info = await gh(token, 'GET', `/repos/${repo}`);
  if (!info.permissions || !info.permissions.push) {
    throw new Error("This token can read the repository but can't change it. Give it Contents: Read and write.");
  }
  return true;
}

async function headCommit(token, repo, branch) {
  const ref = await gh(token, 'GET', `/repos/${repo}/git/ref/heads/${branch}`);
  const commit = await gh(token, 'GET', `/repos/${repo}/git/commits/${ref.object.sha}`);
  return { commitSha: ref.object.sha, treeSha: commit.tree.sha };
}

async function listPaths(token, repo, treeSha) {
  const tree = await gh(token, 'GET', `/repos/${repo}/git/trees/${treeSha}?recursive=1`);
  return tree.tree.filter(t => t.type === 'blob').map(t => t.path);
}

async function commitTree(token, repo, branch, base, entries, message) {
  const tree = await gh(token, 'POST', `/repos/${repo}/git/trees`, { base_tree: base.treeSha, tree: entries });
  const commit = await gh(token, 'POST', `/repos/${repo}/git/commits`, {
    message,
    tree: tree.sha,
    parents: [base.commitSha],
  });
  await gh(token, 'PATCH', `/repos/${repo}/git/refs/heads/${branch}`, { sha: commit.sha });
  return commit.sha;
}

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    })
  );
  return out;
}

/**
 * Upload a project (from readProjectZip) as projects/<folder>/ in one commit.
 * Picks a free folder name based on the project name. Returns the folder name.
 */
export async function addProject(token, repo, branch, project, onProgress = () => {}) {
  const base = await headCommit(token, repo, branch);
  const existing = new Set((await listPaths(token, repo, base.treeSha)).map(p => p.split('/').slice(0, 2).join('/')));
  const slug = slugify(project.name);
  let folder = slug;
  for (let n = 2; existing.has(`projects/${folder}`); n++) folder = `${slug}-${n}`;

  let done = 0;
  const entries = await pool(project.files, 6, async file => {
    const blob = await gh(token, 'POST', `/repos/${repo}/git/blobs`, { content: file.base64, encoding: 'base64' });
    onProgress(++done, project.files.length);
    return { path: `projects/${folder}/${file.path}`, mode: '100644', type: 'blob', sha: blob.sha };
  });
  await commitTree(token, repo, branch, base, entries, `Add project: ${project.name}`);
  return folder;
}

/** Delete projects/<folder>/ in one commit. It stays in the repo's history. */
export async function removeProject(token, repo, branch, folder, name) {
  const base = await headCommit(token, repo, branch);
  const prefix = `projects/${folder}/`;
  const paths = (await listPaths(token, repo, base.treeSha)).filter(p => p.startsWith(prefix));
  if (!paths.length) throw new Error('That project is already gone.');
  const entries = paths.map(path => ({ path, mode: '100644', type: 'blob', sha: null }));
  await commitTree(token, repo, branch, base, entries, `Remove project: ${name || folder}`);
}

// ---------------------------------------------------------------------------
// Opening a student's project privately.
// The zip never goes into the public repository. Its images and sounds are
// packed into one project file, put in a *secret* gist on the teacher's
// account just long enough for GDevelop to load it, then deleted.

const TEMP_PREFIX = 'gdclass-temp: ';

const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  svg: 'image/svg+xml', bmp: 'image/bmp', mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav',
  aac: 'audio/aac', m4a: 'audio/mp4', ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff',
  woff2: 'font/woff2', json: 'application/json', txt: 'text/plain', fnt: 'text/plain',
  xml: 'text/xml', glb: 'model/gltf-binary', mp4: 'video/mp4', webm: 'video/webm', atlas: 'text/plain',
};
const mimeFor = path => MIME[(path.split('.').pop() || '').toLowerCase()] || 'application/octet-stream';
const isAbsoluteUrl = s => /^(https?:|ftp:|data:|blob:)/i.test(s);

/**
 * Turn a "Download a copy" zip into one self-contained project file.
 * Returns { name, text, missing: [resource names not found in the zip] }.
 */
export async function packProjectZip(JSZip, data) {
  const { name, files } = await readProjectZip(JSZip, data);
  const byPath = new Map(files.map(f => [f.path, f.base64]));
  const project = JSON.parse(atobUtf8(byPath.get('game.json')));
  const missing = [];
  const find = file => {
    const tries = [file, file.replace(/\\/g, '/'), file.replace(/^\.\//, '')];
    try { tries.push(decodeURIComponent(file)); } catch (e) {}
    for (const t of tries) if (byPath.has(t)) return t;
    return null;
  };
  for (const res of (project.resources && project.resources.resources) || []) {
    if (!res.file || isAbsoluteUrl(res.file)) continue;
    const hit = find(res.file);
    if (hit) res.file = `data:${mimeFor(hit)};base64,${byPath.get(hit)}`;
    else missing.push(res.name || res.file);
  }
  return { name, text: JSON.stringify(project), missing };
}

function atobUtf8(b64) {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Put the packed project in a secret gist. Returns { id, url }. */
export async function createTempGist(token, name, text) {
  let gist;
  try {
    gist = await gh(token, 'POST', '/gists', {
      public: false,
      description: TEMP_PREFIX + name,
      files: { 'game.json': { content: text } },
    });
  } catch (e) {
    if (e.status === 403 || e.status === 404) {
      const err = new Error('Your token needs the Gists permission (Read and write). Make a new token with it and paste it in.');
      err.status = 403;
      throw err;
    }
    if (e.status === 422) throw new Error('This project is too big to open this way. Open the zip in the GDevelop desktop app instead.');
    throw e;
  }
  return { id: gist.id, url: gist.files['game.json'].raw_url };
}

export async function deleteGist(token, id) {
  try { await gh(token, 'DELETE', `/gists/${id}`); } catch (e) { if (e.status !== 404) throw e; }
}

/** Delete any temporary gists older than maxAgeMinutes (left over from earlier sessions). */
export async function cleanupTempGists(token, maxAgeMinutes = 10) {
  const gists = await gh(token, 'GET', '/gists?per_page=100');
  const cutoff = Date.now() - maxAgeMinutes * 60 * 1000;
  const old = gists.filter(
    g => (g.description || '').startsWith(TEMP_PREFIX) && new Date(g.created_at).getTime() < cutoff
  );
  for (const g of old) await deleteGist(token, g.id);
  return old.length;
}

// ---------------------------------------------------------------------------
// Page settings (the students' hand-in link), stored as config.json in the repo.

/**
 * Change the page settings. `update` receives the current settings from the
 * repository (not a possibly-stale copy) and returns the new settings.
 */
export async function saveConfig(token, repo, branch, update, message = 'Update page settings') {
  let sha;
  let current = {};
  try {
    const file = await gh(token, 'GET', `/repos/${repo}/contents/config.json?ref=${branch}`);
    sha = file.sha;
    current = JSON.parse(atobUtf8(file.content.replace(/\n/g, '')));
  } catch (e) {
    if (e.status !== 404) throw e;
  }
  const next = update(current);
  const text = JSON.stringify(next, null, 2);
  const content = btoa(String.fromCharCode(...new TextEncoder().encode(text)));
  await gh(token, 'PUT', `/repos/${repo}/contents/config.json`, {
    message, content, branch, ...(sha ? { sha } : {}),
  });
  return next;
}

/** Set (or with an empty name, reset) the name shown for a project on the page. */
export function renameProject(token, repo, branch, folder, name) {
  return saveConfig(token, repo, branch, cfg => {
    const titles = { ...(cfg.titles || {}) };
    if (name) titles[folder] = name;
    else delete titles[folder];
    return { ...cfg, titles };
  }, name ? `Rename project: ${folder} → ${name}` : `Reset project name: ${folder}`);
}

// ---------------------------------------------------------------------------
// Previous students' top games (gd.games links), stored in config.json.

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Get the game ID from a gd.games link (or a bare ID). Returns '' if none. */
export function gameIdFromLink(link) {
  const m = String(link || '').match(UUID);
  return m ? m[0].toLowerCase() : '';
}

export function addGame(token, repo, branch, id, caption) {
  return saveConfig(token, repo, branch, cfg => {
    const games = (cfg.games || []).filter(g => g.id !== id);
    games.unshift({ id, caption: caption || '', added: new Date().toISOString() });
    return { ...cfg, games };
  }, `Add top game: ${id}`);
}

/** Change a game's title (empty = use its gd.games name) and caption. */
export function editGame(token, repo, branch, id, { title, caption }) {
  return saveConfig(token, repo, branch, cfg => ({
    ...cfg,
    games: (cfg.games || []).map(g => {
      if (g.id !== id) return g;
      const next = { ...g, caption: caption || '' };
      if (title) next.title = title;
      else delete next.title;
      return next;
    }),
  }), `Edit top game: ${id}`);
}

export function removeGame(token, repo, branch, id) {
  return saveConfig(token, repo, branch, cfg => ({
    ...cfg,
    games: (cfg.games || []).filter(g => g.id !== id),
  }), `Remove top game: ${id}`);
}
