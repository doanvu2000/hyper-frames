import { ref, computed } from 'vue';
import { PREVIEW_FPS } from '../lib/timecode.js';

export const SPEEDS = [0.25, 0.5, 1, 2];
const SHUTTLE = [1, 2, 4];

// Clips are visible in [start, start + duration), so t === duration is always an empty frame.
export function usePlayback({ duration, inPoint, outPoint, sound, posterTime = 2 }) {
  const time = ref(posterTime);
  const playing = ref(false);
  const speed = ref(1);
  const direction = ref(1);
  const loop = ref(false);
  let raf = 0;
  let last = 0;

  const lastFrame = () => Math.max(0, duration.value - 1 / PREVIEW_FPS);
  const hasRange = computed(() => inPoint.value !== null && outPoint.value !== null && outPoint.value > inPoint.value);
  const bounds = () =>
    loop.value && hasRange.value ? [inPoint.value, Math.min(outPoint.value, lastFrame())] : [0, lastFrame()];
  const rate = computed(() => speed.value * direction.value);

  function frame(now) {
    const dt = (now - last) / 1000;
    last = now;
    const [lo, hi] = bounds();
    let t = time.value + dt * rate.value;
    if (t > hi) {
      t = lo;
      sound.play(t, rate.value);
    } else if (t < lo) {
      t = hi;
    }
    time.value = t;
    raf = requestAnimationFrame(frame);
  }

  function play(dir = direction.value) {
    const [lo, hi] = bounds();
    direction.value = dir;
    if (dir > 0 && time.value >= hi - 1 / PREVIEW_FPS) time.value = lo;
    if (dir < 0 && time.value <= lo) time.value = hi;
    if (time.value < lo || time.value > hi) time.value = lo;
    cancelAnimationFrame(raf);
    playing.value = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
    sound.play(time.value, rate.value);
  }

  function pause() {
    playing.value = false;
    cancelAnimationFrame(raf);
    sound.stop();
  }

  function toggle() {
    if (playing.value) pause();
    else {
      direction.value = 1;
      play(1);
    }
  }

  function seek(t) {
    pause();
    time.value = Math.min(lastFrame(), Math.max(0, t));
  }

  const step = (frames) => seek(time.value + frames / PREVIEW_FPS);

  function setSpeed(next) {
    speed.value = next;
    if (playing.value) play();
  }

  // J/K/L shuttle like an NLE: each extra press in the same direction goes faster, the other key slows then reverses.
  function shuttle(dir) {
    if (!playing.value || direction.value !== dir) {
      speed.value = 1;
      play(dir);
      return;
    }
    const i = SHUTTLE.indexOf(speed.value);
    speed.value = SHUTTLE[Math.min(SHUTTLE.length - 1, i + 1)] ?? 1;
    play(dir);
  }

  function clampToDuration() {
    if (time.value > lastFrame()) time.value = Math.min(posterTime, lastFrame());
  }

  function stop() {
    cancelAnimationFrame(raf);
    sound.stop();
  }

  return { time, playing, speed, direction, loop, rate, hasRange, play, pause, toggle, seek, step, setSpeed, shuttle, lastFrame, clampToDuration, stop };
}
