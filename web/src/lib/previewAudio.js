// Plays a composition's <audio> clips in the app window with Web Audio. The iframe can't do it: it has no user
// activation of its own, and media elements loading .ogg/.mp3 trigger download managers such as IDM. fetch() does not.
export class PreviewAudio {
  #ctx = null;
  #gain = null;
  #buffers = new Map();
  #clips = [];
  #sources = [];
  #session = 0;
  muted = false;
  volume = 1;

  setClips(clips) {
    this.stop();
    this.#clips = clips ?? [];
    for (const clip of this.#clips) this.#load(clip.url);
  }

  setMuted(muted) {
    this.muted = muted;
    this.#applyGain();
  }

  setVolume(volume) {
    this.volume = Math.min(1, Math.max(0, volume));
    this.#applyGain();
  }

  // Squared so the slider feels even to the ear; a linear gain crowds all the change into the bottom fifth.
  #applyGain() {
    if (this.#gain) this.#gain.gain.value = this.muted ? 0 : this.volume ** 2;
  }

  play(t) {
    this.stop();
    if (!this.#clips.length) return;
    const ctx = this.#context();
    ctx.resume().catch(() => {});
    const session = this.#session;
    const anchorCtx = ctx.currentTime;
    for (const clip of this.#clips) {
      this.#load(clip.url)
        .then((buffer) => {
          if (!buffer || session !== this.#session) return;
          const now = ctx.currentTime;
          const cur = t + (now - anchorCtx);
          const length = clip.duration ?? buffer.duration - clip.offset;
          if (clip.start + length <= cur) return;
          const late = Math.max(0, cur - clip.start);
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          const gain = ctx.createGain();
          gain.gain.value = clip.volume;
          source.connect(gain).connect(this.#gain);
          source.start(late > 0 ? now : anchorCtx + (clip.start - t), clip.offset + late, length - late);
          this.#sources.push(source);
        })
        .catch(() => {});
    }
  }

  stop() {
    this.#session += 1;
    for (const source of this.#sources) {
      try {
        source.stop();
      } catch {}
    }
    this.#sources = [];
  }

  #context() {
    if (!this.#ctx) {
      this.#ctx = new AudioContext();
      this.#gain = this.#ctx.createGain();
      this.#gain.connect(this.#ctx.destination);
      this.#applyGain();
    }
    return this.#ctx;
  }

  #load(url) {
    if (!this.#buffers.has(url)) {
      const ctx = this.#context();
      const promise = fetch(url)
        .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(res.status))))
        .then((data) => ctx.decodeAudioData(data))
        .catch(() => {
          this.#buffers.delete(url);
          return null;
        });
      this.#buffers.set(url, promise);
    }
    return this.#buffers.get(url);
  }
}
