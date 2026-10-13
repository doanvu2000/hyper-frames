// The HyperFrames runtime only exists inside the renderer, so the preview mimics the two things it does:
// seek every registered timeline, and show timed elements only inside their [data-start, +duration) window.
const SHIM = `<script>
(() => {
  const timed = () => [...document.querySelectorAll('[data-start]')].filter((el) => !el.hasAttribute('data-composition-id'));
  window.__hfPreview = {
    seek(t) {
      const tls = window.__timelines || {};
      for (const key in tls) tls[key].seek(t, false);
      for (const el of timed()) {
        const start = parseFloat(el.dataset.start) || 0;
        const dur = parseFloat(el.dataset.duration);
        const on = t >= start && (Number.isNaN(dur) || t < start + dur);
        el.style.visibility = on ? '' : 'hidden';
      }
      for (const media of document.querySelectorAll('video, audio')) media.pause();
    },
  };
})();
<\/script>`;

// The real runtime pre-creates window.__timelines; HyperFrames' own blank template relies on that.
const ERROR_TRAP = `<script>window.__timelines=window.__timelines||{};window.__hfErrors=[];addEventListener('error',(e)=>window.__hfErrors.push(e.message||'Script error'));<\/script>`;

// rev forces a reload even when a buffer receives markup it already showed two edits ago.
export function withPreviewShim(html, rev) {
  const head = html.match(/<head[^>]*>/i);
  let out = head ? html.replace(head[0], head[0] + ERROR_TRAP) : ERROR_TRAP + html;
  const at = out.lastIndexOf('</body>');
  out = at === -1 ? out + SHIM : out.slice(0, at) + SHIM + out.slice(at);
  return `${out}\n<!-- preview rev ${rev} -->`;
}

function describe(targets) {
  const first = targets?.[0];
  if (!first) return 'timeline';
  if (first.nodeType !== 1) return 'value';
  const name = first.id ? `#${first.id}` : first.classList[0] ? `.${first.classList[0]}` : first.tagName.toLowerCase();
  return targets.length > 1 ? `${name} ×${targets.length}` : name;
}

export function readComposition(win) {
  const doc = win.document;
  const root = doc.querySelector('[data-composition-id]');
  const timelines = win.__timelines ?? {};
  const id = root?.getAttribute('data-composition-id');
  const tl = timelines[id] ?? Object.values(timelines)[0];

  const lanes = new Map();
  if (tl) {
    for (const child of tl.getChildren(false, true, true)) {
      const start = child.startTime();
      const end = start + child.totalDuration();
      const label = describe(child.targets ? child.targets() : null);
      if (!lanes.has(label)) lanes.set(label, []);
      lanes.get(label).push({ start, end });
    }
  }
  const tracks = [...lanes.entries()]
    .map(([label, bars]) => ({ label, bars, first: Math.min(...bars.map((b) => b.start)) }))
    .sort((a, b) => a.first - b.first);

  const declared = parseFloat(root?.getAttribute('data-duration'));
  return {
    duration: Number.isFinite(declared) && declared > 0 ? declared : Math.max(1, tl?.duration() ?? 0),
    width: parseInt(root?.getAttribute('data-width'), 10) || 1920,
    height: parseInt(root?.getAttribute('data-height'), 10) || 1080,
    tracks,
    hasTimeline: Boolean(tl),
    errors: [...(win.__hfErrors ?? [])],
  };
}
