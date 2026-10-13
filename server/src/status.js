import { EventEmitter } from 'node:events';
import { CLIS, probeCli } from './cli.js';

// Claude Code and Codex hold a GET stream open while running; Claude Code exits without DELETE, so a session
// with no stream and no call in flight is only a leftover and is dropped after a short grace period.
const SESSION_IDLE_MS = 2 * 60_000;

export class StatusHub extends EventEmitter {
  constructor({ config }) {
    super();
    this.config = config;
    this.clis = Object.fromEntries(Object.keys(CLIS).map((id) => [id, { checked: false }]));
    this.checking = false;
    this.generation = null;
    this.sessions = new Map();
    this.sweeper = setInterval(() => this.#sweep(), 60_000).unref();
  }

  async refresh() {
    if (this.checking) return this.checking;
    this.checking = (async () => {
      this.#changed();
      await Promise.all(
        Object.keys(CLIS).map(async (id) => {
          try {
            this.clis[id] = { checked: true, ...(await probeCli(id)) };
          } catch (err) {
            this.clis[id] = { checked: true, installed: false, loggedIn: false, detail: err.message };
          }
        }),
      );
    })();
    try {
      await this.checking;
    } finally {
      this.checking = false;
      this.#changed();
    }
  }

  setGeneration(next) {
    this.generation = next;
    this.#changed();
  }

  addSession(id, { client, close }) {
    this.sessions.set(id, { id, client, close, lastSeen: Date.now(), streams: 0, calls: [] });
    this.#changed();
  }

  removeSession(id) {
    if (this.sessions.delete(id)) this.#changed();
  }

  touch(id) {
    const session = this.sessions.get(id);
    if (session) session.lastSeen = Date.now();
  }

  streamOpened(id) {
    const session = this.sessions.get(id);
    if (!session) return () => {};
    session.streams += 1;
    this.#changed();
    return () => {
      session.streams = Math.max(0, session.streams - 1);
      session.lastSeen = Date.now();
      this.#changed();
    };
  }

  beginCall(id, tool) {
    const session = this.sessions.get(id);
    if (!session) return () => {};
    const call = { tool, since: Date.now() };
    session.calls.push(call);
    session.lastSeen = call.since;
    this.#changed();
    return () => {
      session.calls = session.calls.filter((c) => c !== call);
      session.lastSeen = Date.now();
      this.#changed();
    };
  }

  clientOf(id) {
    return this.sessions.get(id)?.client ?? null;
  }

  snapshot() {
    const key = this.config.anthropicApiKey;
    const connections = [
      {
        id: 'api',
        label: 'Anthropic API',
        available: Boolean(key),
        detail: key ? (this.config.keySource === 'env' ? 'Key from ANTHROPIC_API_KEY' : 'Key saved on this computer') : 'No API key yet',
        mcp: null,
      },
      ...Object.entries(CLIS).map(([id, cli]) => {
        const probe = this.clis[id];
        const sessions = [...this.sessions.values()].filter((s) => s.client === id && (s.streams > 0 || s.calls.length > 0));
        const calls = sessions.flatMap((s) => s.calls).sort((a, b) => a.since - b.since);
        return {
          id,
          label: cli.label,
          app: cli.app,
          checked: probe.checked,
          installed: Boolean(probe.installed),
          version: probe.version ?? null,
          available: Boolean(probe.installed && probe.loggedIn),
          detail: probe.detail ?? '',
          login: cli.login,
          install: cli.install,
          mcp: {
            registered: Boolean(probe.mcpRegistered),
            sessions: sessions.length,
            lastSeen: sessions.reduce((max, s) => Math.max(max, s.lastSeen), 0) || null,
            call: calls.at(-1) ?? null,
          },
        };
      }),
    ];
    return { provider: this.config.aiProvider, checking: Boolean(this.checking), generation: this.generation, connections };
  }

  #sweep() {
    const now = Date.now();
    for (const session of this.sessions.values()) {
      if (session.streams === 0 && session.calls.length === 0 && now - session.lastSeen > SESSION_IDLE_MS) {
        this.sessions.delete(session.id);
        session.close?.();
        this.#changed();
      }
    }
  }

  #changed() {
    this.emit('status', this.snapshot());
  }
}
