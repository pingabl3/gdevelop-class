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
