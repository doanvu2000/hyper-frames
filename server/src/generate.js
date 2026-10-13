import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ASPECTS } from './presets.js';
import { HttpError } from './compose.js';
import { CLIS, runCommand } from './cli.js';

export const MODEL = process.env.HF_MODEL || 'claude-opus-5-5';
export const PROVIDERS = ['api', 'claude-cli', 'codex-cli'];

export const AUTHORING_RULES = `You write HyperFrames compositions: one self-contained HTML document that headless Chrome renders frame by frame into a video.

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

export async function generateComposition({ provider = 'api', apiKey, signal, onText, onPhase = () => {}, ...brief }) {
  if (provider === 'claude-cli') return generateWithClaudeCli({ signal, onText, onPhase, brief });
  if (provider === 'codex-cli') return generateWithCodexCli({ signal, onText, onPhase, brief });
  return generateWithApi({ apiKey, signal, onText, onPhase, brief });
}

async function generateWithApi({ apiKey, signal, onText, onPhase, brief }) {
  const client = new Anthropic({ apiKey });
  const stream = client.messages.stream(
    {
      model: MODEL,
      max_tokens: 20000,
      system: AUTHORING_RULES,
      messages: [{ role: 'user', content: buildUserMessage(brief) }],
    },
    { signal },
  );
  stream.on('text', (text) => {
    onPhase('running');
    onText(text);
  });
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

// The CLIs run as plain text generators: no tools, no MCP servers, no user hooks or CLAUDE.md, in an empty temp folder.
async function generateWithClaudeCli({ signal, onText, onPhase, brief }) {
  return withScratchDir(async (dir) => {
    const systemFile = path.join(dir, 'system.txt');
    await fs.writeFile(systemFile, AUTHORING_RULES, 'utf8');
    const args = [
      '-p',
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--system-prompt-file', systemFile,
      '--tools', '',
      '--strict-mcp-config',
      '--setting-sources', 'project',
      '--no-session-persistence',
    ];
    if (process.env.HF_CLAUDE_MODEL) args.push('--model', process.env.HF_CLAUDE_MODEL);
    let streamed = '';
    let result = null;
    const res = await runCommand(CLIS['claude-cli'].bin, args, {
      cwd: dir,
      signal,
      input: buildUserMessage(brief),
      onStdout(line) {
        const event = parseJson(line);
        if (event?.type === 'stream_event') {
          const delta = event.event?.delta;
          if (event.event?.type === 'message_start') onPhase('running');
          if (delta?.type === 'text_delta') {
            streamed += delta.text;
            onText(delta.text);
          }
        } else if (event?.type === 'result') {
          result = event;
        }
      },
    });
    if (res.aborted) throw new HttpError(499, 'Generation stopped.');
    if (result?.is_error) throw new HttpError(502, `Claude CLI: ${result.result || result.subtype || 'the request failed.'}`);
    if (res.code !== 0 && !result) throw new HttpError(502, `Claude CLI exited with code ${res.code}. ${tail(res.stderr)}`.trim());
    return extractHtml(result?.result || streamed);
  });
}

async function generateWithCodexCli({ signal, onText, onPhase, brief }) {
  return withScratchDir(async (dir) => {
    const args = ['exec', '--json', '--skip-git-repo-check', '--sandbox', 'read-only', '--ephemeral', '-C', dir];
    if (process.env.HF_CODEX_MODEL) args.push('-m', process.env.HF_CODEX_MODEL);
    args.push('-');
    const input = `${AUTHORING_RULES}\n\nReply with the document in your final message. Do not run commands or read files.\n\n${buildUserMessage(brief)}`;
    let message = '';
    let failure = null;
    const res = await runCommand(CLIS['codex-cli'].bin, args, {
      cwd: dir,
      signal,
      input,
      onStdout(line) {
        const event = parseJson(line);
        if (!event) return;
        if (event.type === 'turn.started') onPhase('running');
        else if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
          message = event.item.text ?? '';
          onText(message);
        } else if (event.type === 'turn.failed') failure = event.error?.message ?? 'the turn failed.';
        else if (event.type === 'error') failure = event.message ?? 'unknown error.';
      },
    });
    if (res.aborted) throw new HttpError(499, 'Generation stopped.');
    if (!message && failure) throw new HttpError(502, `Codex CLI: ${failure}`);
    if (!message) throw new HttpError(502, `Codex CLI exited with code ${res.code} without an answer. ${tail(res.stderr)}`.trim());
    return extractHtml(message);
  });
}

async function withScratchDir(fn) {
  const dir = path.join(os.tmpdir(), 'hyperframes-studio', randomUUID());
  await fs.mkdir(dir, { recursive: true });
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function parseJson(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function tail(text) {
  return String(text ?? '').trim().split(/\r?\n/).slice(-3).join(' ');
}
