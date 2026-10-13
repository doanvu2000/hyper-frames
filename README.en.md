# HyperFrames Studio

A local app for making short motion videos with [HyperFrames](https://github.com/heygen-com/hyperframes).
Describe a video and let Claude or Codex write it, or import your own HTML and art. Scrub the live preview with
sound, then render MP4, WebM, MOV or GIF on your own machine.

Runs on **Windows** and **macOS** (Linux works from a terminal).

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

1. Click **AI & custom HTML** at the top of the left panel.
2. Under **Model source**, choose **Claude CLI** or **Codex CLI**.
3. Describe the video: what it says, mood, colors and how things move. Pick the frame (Landscape, Portrait, Square)
   and the length in seconds.
4. Press **Generate**. It usually takes 10–60 seconds; Claude streams its progress, Codex sends the result at the end.
5. Check the preview. Press Play to hear the audio; the speaker button mutes it.
6. Edit the HTML below if you like, or tick **Revise** and describe a change.
7. Choose the output under **Render** on the right and press **Render MP4**. Finished files are in the **Renders** tab.

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

Drop the folder on **Import**, then press Generate. The AI is given the list of files and uses them by path. Mention
the important ones in your prompt (“logo from img/logo.png, music/bgm.ogg at volume 0.4”). Audio uses
`<audio id src data-start data-duration data-track-index data-volume>`; overlapping sounds need different track
indexes.

### Templates

A few ready-made templates (title card, stat count-up and others) sit under **Templates** in the left panel, folded
by default. Pick one to edit its fields directly, or use **Start from template** in the custom HTML editor as a base.

## Drive the Studio from a terminal (MCP)

The Studio is also an MCP server, so a `claude` or `codex` session in any folder can make videos with it.

1. Open **AI connections** in the top bar (or step 3 of the guide) and press **Add to Claude Code** or **Add to Codex**.
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

On wide screens, drag the thin handles between the panels to resize the left panel and the Edit/Render panel.
Double-click a handle to reset it; with the keyboard, focus it and use the arrow keys. Sizes are remembered.

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
