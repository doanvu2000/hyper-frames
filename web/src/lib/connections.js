// One status per connection, most urgent first: what it is doing beats whether it could.
export function connectionState(conn, { generation, renders = [] } = {}) {
  if (!conn) return { key: 'off', label: 'Not connected' };
  if (generation?.provider === conn.id) {
    return generation.phase === 'calling'
      ? { key: 'calling', label: 'Calling', detail: `Waiting for ${conn.label} to answer` }
      : { key: 'running', label: 'Running', detail: `${conn.label} is writing a composition` };
  }
  const job = renders.find((r) => r.origin === conn.id && (r.status === 'running' || r.status === 'queued'));
  if (job) {
    return job.status === 'running'
      ? { key: 'rendering', label: `Rendering ${Math.round(job.progress)}%`, detail: `Rendering "${job.name}" for ${conn.label}` }
      : { key: 'rendering', label: 'Render queued', detail: `"${job.name}" from ${conn.label} is waiting in the queue` };
  }
  if (conn.mcp?.call) return { key: 'calling', label: 'Calling', detail: `${conn.label} is using ${conn.mcp.call.tool.replaceAll('_', ' ')}` };
  if (conn.mcp?.sessions) return { key: 'connected', label: 'Connected', detail: `${conn.app ?? conn.label} is connected to the Studio` };
  if (conn.checked === false) return { key: 'checking', label: 'Checking' };
  if (!conn.available) return { key: 'off', label: 'Not connected', detail: conn.detail };
  if (conn.id === 'api') return { key: 'ready', label: 'Ready', detail: conn.detail };
  return {
    key: 'ready',
    label: 'Ready to connect',
    detail: conn.mcp?.registered ? `Start ${conn.app} and it will connect` : `Add the Studio to ${conn.app} to let it make videos`,
  };
}

const URGENCY = ['rendering', 'running', 'calling', 'connected', 'checking', 'ready', 'off'];

export function mostUrgent(states) {
  return [...states].sort((a, b) => URGENCY.indexOf(a.state.key) - URGENCY.indexOf(b.state.key))[0] ?? null;
}
