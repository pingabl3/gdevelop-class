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

## Students handing work in (private)

Student work never goes into this public repository.

1. Make a Google Classroom assignment (or Google Form with a file upload) for the hand-in.
2. In the Teacher panel, paste its link under **Hand-in link for students** and click Save.
   Students now see a **Hand in** button with instructions: *Download a copy* in GDevelop, then attach the zip.
3. To look at a submission, download the student's zip from Classroom and drop it on
   **Open a student's project (private)**. Click **Open in GDevelop**.

To open it, the page packs the project into one file and puts it in a **secret gist** on your
GitHub account (not listed anywhere). The gist is deleted 2 minutes after you click Open, and
any leftover copies are deleted the next time you open the Teacher panel.
This needs your token to have **Gists: Read and write**.

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
