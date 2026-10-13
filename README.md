# HyperFrames Studio

A local web tool for turning short copy into motion clips with [HyperFrames](https://github.com/heygen-com/hyperframes).
Pick a template, edit its fields, scrub the live preview, then render MP4, WebM, MOV or GIF on your own machine.

## Requirements

- Node.js 22 or newer
- FFmpeg on `PATH`
- Network access on first render (HyperFrames downloads its headless Chrome; compositions load GSAP and Google Fonts from CDNs)

## Run

On Windows, double-click **`HyperFrames Studio.cmd`**. The first run installs dependencies; later runs start
in a few seconds and open the browser. Close the console window to stop the studio.

From a terminal:

```bash
npm install
npm run dev        # API on http://127.0.0.1:8787, UI on http://localhost:5173
```

Production-style: `npm run build && npm start`, then open http://127.0.0.1:8787.

## How it works

- `server/` (Express) builds composition HTML from templates in `server/src/templates`, and renders it by spawning the
  pinned `hyperframes` CLI. Progress comes from the CLI's `@hf-progress` lines and streams to the UI over SSE.
  Renders run one at a time and are kept in `server/data/renders/<id>/`.
- `web/` (Vue 3 + Vite) previews the same HTML in an iframe. A small shim seeks `window.__timelines` and hides
  timed elements outside their `data-start`/`data-duration` window, mirroring what the HyperFrames runtime does.
  The dope sheet under the preview is read from the live GSAP timeline.
- **Custom HTML** mode accepts any HyperFrames composition. The server binds to `127.0.0.1` by default because
  it renders whatever HTML it is sent; set `HOST` only on a trusted network.

## AI and custom HTML

Open **AI & custom HTML** in the template list.

- **Generate with AI** — describe the video; Claude writes a HyperFrames composition that lands in the editor, ready to
  preview, tweak and render. Tick "Revise" to change the current HTML instead of starting over. Needs an Anthropic
  API key: paste it in the panel (saved to `server/data/config.json`, never sent to the browser) or set
  `ANTHROPIC_API_KEY`. The model defaults to `claude-opus-5-5`; override with `HF_MODEL`.
- **Model source** — instead of an API key, pick **Claude CLI** or **Codex CLI** to generate with the subscription you
  are signed in to (`claude auth login` / `codex login`). The CLIs run without tools in an empty temp folder. Override
  their models with `HF_CLAUDE_MODEL` / `HF_CODEX_MODEL`.
- **Import** — drop an `.html` file, or the folder it lives in when it uses local images, video, audio or fonts.
  Assets are stored per import in `server/data/projects/<id>/` and copied next to the HTML for each render.

## Drive the Studio from Claude Code or Codex (MCP)

The Studio is also an MCP server at `http://127.0.0.1:8787/mcp`. Open **AI connections** in the top bar and press
**Add to Claude Code** / **Add to Codex** (or run `claude mcp add --scope user --transport http hyperframes-studio
"http://127.0.0.1:8787/mcp?client=claude-cli"`). Then, in a new CLI session, ask it to make a video. It can read the
authoring guide, fill templates, look at frames, run checks, open the result in the Studio and render it.

The same menu shows each connection's state: Not connected, Ready to connect, Connected, Calling, Running, and
Rendering with its progress. Keep the Studio open while a CLI uses it.

## Adding a template

Create `server/src/templates/<name>.js` exporting `{ id, name, summary, duration, fields, build(values, ctx) }`
and register it in `server/src/templates/index.js`. `build` returns `{ css, body, timeline }`; the timeline code
adds tweens to the paused `tl`. Keep it deterministic — no `Math.random()`, `Date.now()` or fetches.
