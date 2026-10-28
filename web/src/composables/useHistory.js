import { ref, computed, watch, nextTick } from 'vue';

// Snapshot-based undo for the whole document. Typing bursts settle into one step after a short pause.
export function useHistory(read, apply, { limit = 60, settle = 500 } = {}) {
  const past = ref([]);
  const future = ref([]);
  let committed = JSON.stringify(read());
  let applying = false;
  let timer = 0;
  const pending = ref(false);

  function commit() {
    clearTimeout(timer);
    timer = 0;
    pending.value = false;
    const now = JSON.stringify(read());
    if (now === committed) return;
    past.value = [...past.value.slice(-(limit - 1)), committed];
    future.value = [];
    committed = now;
  }

  watch(
    () => JSON.stringify(read()),
    () => {
      if (applying) return;
      clearTimeout(timer);
      timer = setTimeout(commit, settle);
      pending.value = true;
    },
  );

  async function restore(snapshot) {
    applying = true;
    committed = snapshot;
    apply(JSON.parse(snapshot));
    await nextTick();
    applying = false;
  }

  function undo() {
    if (timer) commit();
    if (!past.value.length) return;
    future.value = [...future.value, committed];
    const prev = past.value[past.value.length - 1];
    past.value = past.value.slice(0, -1);
    restore(prev);
  }

  function redo() {
    if (timer) commit();
    if (!future.value.length) return;
    past.value = [...past.value, committed];
    const next = future.value[future.value.length - 1];
    future.value = future.value.slice(0, -1);
    restore(next);
  }

  // Opening another project starts a fresh history; undo must never jump across projects.
  function reset() {
    clearTimeout(timer);
    timer = 0;
    pending.value = false;
    past.value = [];
    future.value = [];
    committed = JSON.stringify(read());
  }

  return {
    undo,
    redo,
    reset,
    canUndo: computed(() => past.value.length > 0 || pending.value),
    canRedo: computed(() => future.value.length > 0),
  };
}
