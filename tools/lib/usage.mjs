// Usage recorder (K-13). Native sources verified in the P0b spike:
//  - codex: session rollout JSONL under ~/.codex/sessions with token_count records
//  - pi: status bar text such as "↑13k ↓2.6k R99k CH95.5% $0.007"
//  - claude: not yet verified; recorded as unavailable unless a value is supplied
// Missing data is recorded as missing, never as zero.

import { readFileSync } from 'node:fs';

export function parseCodexRollout(file) {
  const text = readFileSync(file, 'utf8');
  let last = null;
  let count = 0;
  for (const line of text.split('\n')) {
    if (!line.includes('token_count')) continue;
    try {
      const d = JSON.parse(line);
      const p = d.payload || d;
      if ((p.type || d.type) === 'token_count' || p.info?.total_token_usage) {
        last = d;
        count++;
      }
    } catch {
      /* ignore partial line */
    }
  }
  if (!last) return { status: 'unavailable', reason: 'no token_count records', records: 0 };
  const info = (last.payload || last).info || last.payload || last;
  const t = info.total_token_usage || {};
  return {
    status: 'actual',
    source: 'codex-session-rollout',
    records: count,
    timestamp: last.timestamp || null,
    tokens: {
      input: num(t.input_tokens),
      cached_input: num(t.cached_input_tokens),
      output: num(t.output_tokens),
      reasoning: num(t.reasoning_output_tokens),
      total: num(t.total_tokens),
    },
    context_window: num(info.model_context_window),
  };
}

function num(v) {
  return typeof v === 'number' ? v : null;
}

function kNum(s) {
  if (s == null) return null;
  const m = String(s).match(/^([\d.]+)([kKmM]?)$/);
  if (!m) return null;
  const n = Number(m[1]);
  return m[2].toLowerCase() === 'k' ? Math.round(n * 1000) : m[2].toLowerCase() === 'm' ? Math.round(n * 1e6) : n;
}

// Pi status bar: ↑<in> ↓<out> R<reasoning> CH<cache%>% $<cost> <ctx%>/<window>
export function parsePiStatusBar(text) {
  const m = String(text).match(/↑([\d.]+[kKmM]?)\s+↓([\d.]+[kKmM]?)(?:\s+R([\d.]+[kKmM]?))?(?:\s+CH([\d.]+)%)?(?:\s+\$([\d.]+))?/);
  if (!m) return { status: 'unavailable', reason: 'status bar pattern not found' };
  return {
    status: 'actual',
    source: 'pi-status-bar',
    tokens: { input: kNum(m[1]), output: kNum(m[2]), reasoning: kNum(m[3]), cache_hit_pct: m[4] ? Number(m[4]) : null },
    cost: m[5] ? { amount: Number(m[5]), currency: 'USD', basis: 'pi-configured-rate-estimate' } : null,
  };
}

// Build a usage record for the audit log. Estimates must carry a rate source.
export function usageRecord({ runtime, model, effort, dispatch_id, task_id, run_id, started_at, ended_at, attempts = 1, measurement, limits = null, rate = null }) {
  const elapsed = started_at && ended_at ? Math.round((Date.parse(ended_at) - Date.parse(started_at)) / 1000) : null;
  const rec = {
    event_type: 'usage_recorded',
    run_id, task_id, dispatch_id,
    runtime, model, effort,
    started_at: started_at || null,
    ended_at: ended_at || null,
    elapsed_seconds: elapsed,
    attempts,
    limits,
    measurement_status: measurement?.status || 'unavailable',
    source: measurement?.source || null,
    tokens: measurement?.tokens || null,
    cost: measurement?.cost || null,
  };
  if (!rec.cost && rate && rec.tokens && rec.tokens.input != null && rec.tokens.output != null) {
    const amount = (rec.tokens.input / 1e6) * rate.input_per_million + (rec.tokens.output / 1e6) * rate.output_per_million;
    rec.cost = { amount: Number(amount.toFixed(6)), currency: rate.currency || 'USD', basis: 'estimated', rate_source: rate.source || 'configured' };
  }
  if (rec.measurement_status === 'unavailable') rec.gap = 'no native token or cost telemetry captured for this dispatch';
  return rec;
}

// Coverage summary over an audit log: every dispatch needs time/attempt data;
// token/cost gaps are listed, never zero-filled (D-12).
export function coverage(events) {
  const dispatches = new Map();
  for (const e of events) {
    if (e.event_type === 'dispatch_started' && e.dispatch_id) dispatches.set(e.dispatch_id, { dispatch_id: e.dispatch_id, runtime: e.runtime || null, usage: null });
  }
  for (const e of events) if (e.event_type === 'usage_recorded' && dispatches.has(e.dispatch_id)) dispatches.get(e.dispatch_id).usage = e;
  const rows = [...dispatches.values()];
  return {
    dispatches: rows.length,
    with_time: rows.filter((r) => r.usage && r.usage.elapsed_seconds != null).length,
    with_tokens: rows.filter((r) => r.usage && r.usage.measurement_status === 'actual').length,
    missing_usage: rows.filter((r) => !r.usage).map((r) => r.dispatch_id),
    token_gaps: rows.filter((r) => r.usage && r.usage.measurement_status !== 'actual').map((r) => ({ dispatch_id: r.dispatch_id, status: r.usage.measurement_status })),
  };
}
