import { t } from './i18n.js';

// One status per connection, most urgent first: what it is doing beats whether it could.
export function connectionState(conn, { generation, renders = [] } = {}) {
  if (!conn) return { key: 'off', label: t('state.notConnected') };
  if (generation?.provider === conn.id) {
    return generation.phase === 'calling'
      ? { key: 'calling', label: t('state.calling'), detail: t('state.waiting', { label: conn.label }) }
      : { key: 'running', label: t('state.running'), detail: t('state.writing', { label: conn.label }) };
  }
  const job = renders.find((r) => r.origin === conn.id && (r.status === 'running' || r.status === 'queued'));
  if (job) {
    return job.status === 'running'
      ? { key: 'rendering', label: t('state.rendering', { p: Math.round(job.progress) }), detail: t('state.renderingFor', { name: job.name, label: conn.label }) }
      : { key: 'rendering', label: t('state.queued'), detail: t('state.queuedFor', { name: job.name, label: conn.label }) };
  }
  if (conn.mcp?.call) return { key: 'calling', label: t('state.calling'), detail: t('state.using', { label: conn.label, tool: conn.mcp.call.tool.replaceAll('_', ' ') }) };
  if (conn.mcp?.sessions) return { key: 'connected', label: t('state.connected'), detail: t('state.connectedTo', { app: conn.app ?? conn.label }) };
  if (conn.checked === false) return { key: 'checking', label: t('state.checking') };
  if (!conn.available) return { key: 'off', label: t('state.notConnected'), detail: conn.detail };
  if (conn.id === 'api') return { key: 'ready', label: t('state.ready'), detail: conn.detail };
  return {
    key: 'ready',
    label: t('state.readyToConnect'),
    detail: conn.mcp?.registered ? t('state.startApp', { app: conn.app }) : t('state.addApp', { app: conn.app }),
  };
}

const URGENCY = ['rendering', 'running', 'calling', 'connected', 'checking', 'ready', 'off'];

export function mostUrgent(states) {
  return [...states].sort((a, b) => URGENCY.indexOf(a.state.key) - URGENCY.indexOf(b.state.key))[0] ?? null;
}
