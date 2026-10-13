import Anthropic from '@anthropic-ai/sdk';
import { ASPECTS } from './presets.js';
import { HttpError } from './compose.js';

export const MODEL = process.env.HF_MODEL || 'claude-opus-5-5';

const SYSTEM = `You write HyperFrames compositions: one self-contained HTML document that headless Chrome renders frame by frame into a video.

Hard rules (the renderer breaks without them):
1. Root element: <div id="root" data-composition-id="main" data-start="0" data-duration="{D}" data-width="{W}" data-height="{H}">. html and body are exactly W x H px with overflow: hidden and an explicit background.
2. Every timed visual element has an id, class="clip", data-start and data-duration in seconds. Add the CSS rule .clip { position: absolute; inset: 0; }. Elements are hidden outside their [start, start + duration) window.
3. All motion uses GSAP 3.14.2 loaded from https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js. Build exactly one root timeline:
   window.__timelines = window.__timelines || {};
   const tl = gsap.timeline({ paused: true });
   ...tweens with absolute position parameters, e.g. tl.fromTo(el, {...}, {...}, 1.2)...
   window.__timelines["main"] = tl;
   Never call play(). No CSS animations or transitions, no setTimeout, setInterval or requestAnimationFrame: the renderer seeks the timeline to each frame, so anything not on tl will be wrong.
4. Deterministic only: no Math.random(), Date.now(), fetch or external data. For counting numbers, tween an object whose method is a getter/setter that writes textContent, e.g. const c = { value(v) { if (v === undefined) return cur; cur = v; el.textContent = Math.round(v); } }; tl.fromTo(c, { value: 0 }, { value: 100, duration: 2 }, 0.5).
5. External resources: only GSAP and Google Fonts <link> tags. Use images or video only from the provided asset list, by their relative paths. Otherwise draw with CSS, gradients and inline SVG.

Design standards:
- Strong typography with a clear hierarchy; keep text inside safe margins of at least 6% of the frame; body text at least 34px per 1080px of the short side.
- Choose a cohesive palette with high contrast. Prefer purposeful, well-eased motion (power3/expo/back) over constant movement; stagger related items.
- Use the full requested duration: build in, hold long enough to read, then a short outro that ends on a clean frame.

Output only the complete HTML document starting with <!doctype html>. No Markdown fences, no commentary.`;

export function buildUserMessage({ prompt, aspect, duration, currentHtml, assets }) {
  const parts = [];
  if (currentHtml) {
    parts.push(
      'Revise the composition below according to the brief. Keep everything the brief does not ask to change, including its frame size and length unless asked.',
      `<current_composition>\n${currentHtml}\n</current_composition>`,
    );
  } else {
    const frame = ASPECTS[aspect] ?? ASPECTS['16:9'];
    parts.push(`Frame: ${frame.width} x ${frame.height} px (${aspect}). Duration: ${duration} seconds.`);
  }
  if (assets?.length) parts.push(`Available asset files (relative paths): ${assets.join(', ')}`);
  parts.push(`Brief: ${prompt}`);
  return parts.join('\n\n');
}

export function extractHtml(text) {
  const start = text.search(/<!doctype html|<html/i);
  const end = text.toLowerCase().lastIndexOf('</html>');
  if (start === -1 || end === -1) throw new HttpError(502, 'The model did not return an HTML document. Try again or make the brief more specific.');
  return text.slice(start, end + '</html>'.length);
}

export async function generateComposition({ apiKey, signal, onText, ...brief }) {
  const client = new Anthropic({ apiKey });
  const stream = client.messages.stream(
    {
      model: MODEL,
      max_tokens: 20000,
      system: SYSTEM,
      messages: [{ role: 'user', content: buildUserMessage(brief) }],
    },
    { signal },
  );
  stream.on('text', onText);
  try {
    const message = await stream.finalMessage();
    const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    if (message.stop_reason === 'max_tokens') {
      throw new HttpError(502, 'The composition was too long and got cut off. Ask for fewer scenes or a shorter video.');
    }
    return extractHtml(text);
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new HttpError(401, 'The Anthropic API key was rejected. Check it in AI settings.');
    if (err instanceof Anthropic.RateLimitError) throw new HttpError(429, 'The Anthropic API is rate limiting this key. Wait a minute and try again.');
    if (err instanceof Anthropic.APIError) throw new HttpError(502, `Anthropic API error: ${err.message}`);
    throw err;
  }
}
