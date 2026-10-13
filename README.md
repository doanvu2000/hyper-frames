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

## Adding a template

Create `server/src/templates/<name>.js` exporting `{ id, name, summary, duration, fields, build(values, ctx) }`
and register it in `server/src/templates/index.js`. `build` returns `{ css, body, timeline }`; the timeline code
adds tweens to the paused `tl`. Keep it deterministic — no `Math.random()`, `Date.now()` or fetches.
