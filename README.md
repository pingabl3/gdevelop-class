# GDevelop Class Projects

A place to share **editable** GDevelop projects (events, behaviours, objects, assets) with students.
Each project gets a link that opens it directly in the GDevelop web editor.

**Class page:** https://pingabl3.github.io/gdevelop-class/

> ⚠️ This repository is **public**. Use it for starter projects, examples and exemplars, not student work.

## Adding and removing projects (teacher)

1. Open your project at [editor.gdevelop.io](https://editor.gdevelop.io).
2. **File → Save as → Download a copy**. You get a `.zip`.
3. On the class page, click **Teacher**, then drop the `.zip` into **Add a project**.

After about a minute, the project shows up on the class page with an **Open in GDevelop** button.
The card uses the project name and description from GDevelop's *Game settings*.

To remove a project, click **Remove** on its card while the Teacher panel is signed in.
Removed projects stay in the repository's history on GitHub. To update a project, remove the old one and upload the new zip.

**First time only:** the Teacher panel asks for a GitHub fine-grained token with
*Contents: Read and write* on this repository only. The page explains how to make one.
The token is saved only in that browser. Use **Forget token** on shared computers.

You can still add a project by hand: unzip it and upload the folder into `projects/` on GitHub.

## Previous Students' Top Games

In the Teacher panel, paste any gd.games game link (`https://gd.games/games/<id>` or `https://gd.games/<user>/<game>`) under
**Add a top game** and add an optional caption, such as "Year 11, 2025". On the next page build,
GitHub fetches the game's name, description and first screenshot from gd.games. The details also
refresh once a day. On each game card, **Edit** changes the title or caption, and **Remove** takes
it off the page. Removing it here doesn't touch the game on gd.games. Games are stored in `config.json`.

## Help requests from students (private)

Students who are stuck click **Ask for help** on the class page. They type their name and what they
need help with, choose their project zip (*File → Save as → Download a copy* in GDevelop), and click
**Send to my teacher**.

Each request is saved privately in **your Google Drive**, in a folder called *GDevelop help requests*.
It never goes into this public repository. The Teacher panel lists requests, newest first. Each one has:

- **Open in GDevelop**: opens the student's full project in a new tab;
- **Download .zip**: saves their zip to your computer;
- **Mark done**: moves it to the *Done* folder in Drive (nothing is deleted).

### One-time setup

The inbox is a small Google Apps Script ([`helpdesk/Code.gs`](helpdesk/Code.gs)) that runs under your
Google account. The Teacher panel walks you through it:

1. At [script.google.com](https://script.google.com), create a new project and paste in `Code.gs`.
2. Run the `setup` function once and allow access. The log shows your **teacher key**.
3. **Deploy → New deployment → Web app**, with *Execute as: Me* and *Who has access: Anyone*.
4. In the Teacher panel, paste the Web app URL and the teacher key, then click Save.

The teacher key is saved only in your browser. Without it, nobody can list or download requests;
anyone can only *send* one. If the key ever leaks, run `newTeacherKey` in the script and paste the new key in.

### How "Open in GDevelop" works

GDevelop's web editor can only open a project from a web address. So the page packs the project
into one file and puts it in a **secret gist** on your GitHub account, which isn't listed anywhere.
The gist is deleted 2 minutes after opening, and any leftover copies are deleted the next time you
open the class page. This needs your GitHub token to have **Gists: Read and write**.

## Sending a project back to a student (private link)

After helping a student, in GDevelop choose **File → Save as → Download a copy**. In the Teacher panel,
drop that zip on **Send a project back to a student**. Type the student's name (for your list) and check
the project name, which is filled in as "<name> v2". Then click **Create private link**, copy the link
and send it to the student.

The link opens a page that shows the project name with steps: log in to GDevelop, click
**Open in GDevelop**, then **File → Save as → GDevelop Cloud**. The project isn't shown on the class
page and isn't listed anywhere; only people with the link can open it. It's stored as a secret gist
on your GitHub account, with its images and sounds packed inside, so the student's saved copy never
depends on the link. **Private links you've sent** lists them, with **Copy link** and **Delete**.
Deleting a link doesn't affect copies students already saved.

## What students do

1. Log in at editor.gdevelop.io.
2. Click **Open in GDevelop** on the class page, or use a link you post in Google Classroom.
3. **File → Save as → GDevelop Cloud** to keep their own copy.

## Linking to a single project

Every link has this form:

```
https://editor.gdevelop.io/?project=https://raw.githubusercontent.com/pingabl3/gdevelop-class/main/projects/FOLDER/game.json
```

The "Make a link" box on the class page builds these for you.

## Notes

- If GDevelop reports that a resource failed to load, click **Retry**. It's usually a slow download.
- Google Drive can't host projects for this. The link has to point at a GitHub file like the ones here.
- `projects.json` is generated automatically by the GitHub Action. You don't edit it.
