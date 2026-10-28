# HyperFrames Studio

A local app for making short motion videos with [HyperFrames](https://github.com/heygen-com/hyperframes).
Describe a video and let Claude or Codex write it, or import your own HTML and art. Scrub the live preview with
sound, then render MP4, WebM, MOV or GIF on your own machine.

Runs on **Windows** and **macOS** (Linux works from a terminal).

![HyperFrames Studio](docs/screenshots/studio-dark.png)

<table>
<tr>
<td><img src="docs/screenshots/studio-light.png" alt="Light theme"></td>
<td><img src="docs/screenshots/templates.png" alt="Template picker"></td>
<td><img src="docs/screenshots/renders.png" alt="Render list"></td>
</tr>
<tr>
<td align="center">Light theme</td>
<td align="center">Templates</td>
<td align="center">Renders</td>
</tr>
</table>

## Requirements

| | Windows | macOS |
|---|---|---|
| Node.js 22 or newer | [nodejs.org](https://nodejs.org) installer | [nodejs.org](https://nodejs.org) or `brew install node` |
| FFmpeg on `PATH` | `winget install Gyan.FFmpeg` | `brew install ffmpeg` |
| An AI to write videos (optional) | Claude CLI or Codex CLI, or an Anthropic API key | same |

The first render needs network access: HyperFrames downloads its headless Chrome, and compositions load GSAP and
Google Fonts from CDNs.

## Start the Studio

**Windows:** double-click **`HyperFrames Studio.cmd`**.

**macOS:** double-click **`HyperFrames Studio.command`**. The first time, macOS may block it: right-click the file,
choose **Open**, then **Open** again. If it says the file is not executable, run once in Terminal:

```bash
chmod +x "HyperFrames Studio.command"
```

The first run installs dependencies and builds the interface (about a minute). Later runs start in a few seconds and
open http://127.0.0.1:8787 in your browser. Keep the console or Terminal window open while you work; close it to stop
the Studio. Opening the launcher again after an update restarts the Studio with the new code.

From a terminal instead:

```bash
npm install
npm run dev        # API on http://127.0.0.1:8787, UI with hot reload on http://localhost:5173
```

Production-style: `npm run build && npm start`, then open http://127.0.0.1:8787.

## First run: connect Claude or Codex

The Studio opens a short **Getting started** guide on the first visit (reopen it with the **?** button in the top
bar). It shows whether each CLI is installed and signed in, with the commands to copy.

You only need one of them:

| | Install | Sign in |
|---|---|---|
| Claude CLI (Claude Pro / Max / Team) | `npm install -g @anthropic-ai/claude-code` | `claude auth login` |
| Codex CLI (ChatGPT plan) | `npm install -g @openai/codex` | `codex login` |

After installing or signing in, press **Check again** in the guide or under **AI connections**.

No subscription? Pick **API key** under Model source and paste an Anthropic API key. It is saved only in
`server/data/config.json` and never sent to the browser. `ANTHROPIC_API_KEY` in the environment also works.

## Make a video in the Studio

1. Click **Create** in the tool rail on the left.
2. Under **Model source**, choose **Claude CLI** or **Codex CLI**.
3. Describe the video: what it says, mood, colors and how things move. Pick the frame (16:9, 9:16, 1:1) and the length.
4. Press **Generate with Claude CLI** (or Codex CLI). It usually takes 10–60 seconds; Claude streams its progress, Codex sends the result at the end.
5. Check the preview. Press Play (or Space) to hear the audio; the speaker in the transport sets the volume.
6. To change it, choose **Revise this one** and describe the change; to edit by hand, open **HTML** in the rail.
7. Press **Export video** in the top bar (Ctrl+E), pick frames, formats and the part to export. Finished files are in
   **Renders**.

### Projects and version history

Each video is a project saved on this machine (`server/data/library/`) and saved as you edit. Click the project name in
the top bar to rename it, open another, start a new one, duplicate or delete it.

Every AI result, import, template start and manual save (Ctrl+S) becomes a version. They are listed under the prompt in
**Create** and in full under **History**. Compare one in the preview (`\` switches A/B with the current version) or
restore it as a new version. Ctrl+Z / Ctrl+Shift+Z undo and redo every change in the session.

### Preview and timeline

- **Safe area overlays:** title/action safe, TikTok, Reels and Shorts UI frames (Shift+S cycles them).
- **Zoom:** Fit, 50%, 100%, 200%.
- **Save PNG:** writes the current frame to an image (Shift+P).
- **In and out:** I and O mark a part, X clears it, Shift+L loops it. Export can render just that part.
- **Speed:** 0.25×–2×; J/K/L shuttle back, pause and forward (press again to go faster).
- **Markers:** M adds one at the playhead, `[` `]` jump between them, double-click a marker to remove it.

### Edit the HTML

**HTML** is a code editor with highlighting, folding and find/replace (Ctrl+F, Ctrl+H). Common mistakes show on their
line as you type (missing root, overlapping audio on one track, `Math.random()`, …). **Check composition** runs the
full HyperFrames check and marks each finding on its line.

### Export several files at once

In **Export video**, pick several formats (MP4, WebM, MOV, GIF) and, for templates, several frames: the template lays
each frame out again instead of cropping 16:9. Choose **In–out** to export only the marked part. Turn on **Notify me
when the renders finish** to get a system notification while you work in another window.

### Shortcuts

Ctrl+K opens the command palette: type a command or a project name. It lists every shortcut.

| Keys | Action |
|---|---|
| Space · J K L | Play/pause · shuttle back, pause, forward |
| ← → · Shift+← → | Back/forward one frame · one second |
| I · O · X · Shift+L | In point · out point · clear · loop the part |
| M · `[` `]` | Add marker · jump between markers |
| Ctrl+Z · Ctrl+Shift+Z | Undo · redo |
| Ctrl+S · Ctrl+E · Ctrl+K | Save a version · export · commands |
| Alt+1…6 | Open Create, HTML, Templates, Assets, Renders, History |
| Shift+S · Shift+P · F | Overlay · save PNG · full screen |

### Use your own art and sound

Prepare a folder with an `index.html` (a placeholder is fine) and your files, for example:

```
my-promo/
  index.html
  img/logo.png
  sfx/whoosh.ogg
  music/bgm.ogg
  fonts/Brand.ttf
```

Drop the folder on Import under **Assets**, then generate in **Create**. The AI is given the list of files and uses them by path. Mention
the important ones in your prompt (“logo from img/logo.png, music/bgm.ogg at volume 0.4”). Audio uses
`<audio id src data-start data-duration data-track-index data-volume>`; overlapping sounds need different track
indexes.

### Templates

Ready-made templates (title card, stat count-up and others) live under **Templates** in the tool rail. Pick one to edit
its fields directly, or press **Edit as HTML** to use it as a base and change anything.

## Drive the Studio from a terminal (MCP)

The Studio is also an MCP server, so a `claude` or `codex` session in any folder can make videos with it.

1. Open the AI connections menu (the **AI · … ready** chip) in the top bar (or step 3 of the guide) and press **Add to Claude Code** or **Add to Codex**.
   By hand:
   ```bash
   claude mcp add --scope user --transport http hyperframes-studio "http://127.0.0.1:8787/mcp?client=claude-cli"
   codex mcp add hyperframes-studio --url "http://127.0.0.1:8787/mcp?client=codex-cli"
   ```
2. Start a **new** CLI session and ask, for example:
   > Use HyperFrames Studio to make a 6-second intro for my app, show it in the Studio, then render an MP4.

The CLI can read the authoring guide, fill templates, look at frames, run checks, open the result in the Studio
(with an Undo toast) and render it. The connections menu shows each one's state: Not connected, Ready to connect,
Connected, Calling, Running, and Rendering with progress. Keep the Studio open while a CLI uses it.

## Layout

The Studio always fits the window; the page never scrolls. The tool rail on the left chooses what the right panel
shows; the preview, transport and timeline sit in the middle. Drag the thin handle at the left edge of the right panel
to resize it (double-click to reset; with the keyboard, focus it and use the arrow keys). On phones the rail moves to
the bottom and the timeline folds into a seek bar.

## Troubleshooting

- **“FFmpeg not found”** — install FFmpeg (see Requirements), then reopen the launcher.
- **CLI shows Not installed / Not signed in** — run the install or sign-in command in a terminal, then press Check again.
  On macOS, if the CLI is installed but not found, open the Studio from the `.command` file (it loads Homebrew and nvm
  paths) or start it from a Terminal where `claude --version` works.
- **“An older version of the studio is still running”** — close the old console/Terminal window (or end `node` in
  Task Manager / Activity Monitor), then open the launcher again.
- **Download managers (IDM)** — the Studio avoids triggering them: downloads end in the real file name, and preview
  audio is fetched instead of loaded by media elements.

## How it works

- `server/` (Express) builds composition HTML from templates in `server/src/templates`, and renders it by spawning the
  pinned `hyperframes` CLI. Progress comes from the CLI's `@hf-progress` lines and streams to the UI over SSE.
  Renders run one at a time and are kept in `server/data/renders/<id>/`. Imports live in `server/data/projects/<id>/`
  and are copied next to the HTML for each render.
- `web/` (Vue 3 + Vite) previews the same HTML in an iframe. A small shim seeks `window.__timelines` and hides timed
  elements outside their `data-start`/`data-duration` window, mirroring what the HyperFrames runtime does. The dope
  sheet under the preview is read from the live GSAP timeline. `<audio>` clips are played with Web Audio in the app
  window, in sync with the playhead.
- The CLIs run without tools in an empty temp folder. Override models with `HF_MODEL` (API), `HF_CLAUDE_MODEL` and
  `HF_CODEX_MODEL`.
- The server binds to `127.0.0.1` because it renders whatever HTML it is sent; set `HOST` only on a trusted network.
  It is a local app by design: rendering needs headless Chrome, FFmpeg and your signed-in CLIs, so it does not run on
  serverless hosts such as Cloudflare Workers.

## Adding a template

Create `server/src/templates/<name>.js` exporting `{ id, name, summary, duration, fields, build(values, ctx) }`
and register it in `server/src/templates/index.js`. `build` returns `{ css, body, timeline }`; the timeline code
adds tweens to the paused `tl`. Keep it deterministic — no `Math.random()`, `Date.now()` or fetches.
