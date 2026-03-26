export interface UsageStats {
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  // Rolling window stats
  rpm: number;        // requests per minute (last 60s)
  tpm: number;        // tokens per minute (last 60s)
  rpd: number;        // requests per day (last 24h)
  lastModel: string;
  lastRequestTime: number | null;
}

interface RequestRecord {
  timestamp: number;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

const ONE_MINUTE = 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;

let records: RequestRecord[] = [];
let listeners: Array<(stats: UsageStats) => void> = [];

function cleanup() {
  const cutoff = Date.now() - ONE_DAY;
  records = records.filter(r => r.timestamp > cutoff);
}

function computeStats(): UsageStats {
  cleanup();
  const now = Date.now();
  const minuteAgo = now - ONE_MINUTE;

  const recentMinute = records.filter(r => r.timestamp > minuteAgo);
  const rpm = recentMinute.length;
  const tpm = recentMinute.reduce((s, r) => s + r.inputTokens + r.outputTokens, 0);
  const rpd = records.length;

  const totalInputTokens = records.reduce((s, r) => s + r.inputTokens, 0);
  const totalOutputTokens = records.reduce((s, r) => s + r.outputTokens, 0);

  const last = records.length > 0 ? records[records.length - 1] : null;

  return {
    totalRequests: records.length,
    totalInputTokens,
    totalOutputTokens,
    totalTokens: totalInputTokens + totalOutputTokens,
    rpm,
    tpm,
    rpd,
    lastModel: last?.model || '-',
    lastRequestTime: last?.timestamp || null,
  };
}

export function trackRequest(usageMetadata: any, model: string) {
  const inputTokens = usageMetadata?.promptTokenCount || usageMetadata?.inputTokens || 0;
  const outputTokens = usageMetadata?.candidatesTokenCount || usageMetadata?.outputTokens || 0;

  records.push({
    timestamp: Date.now(),
    inputTokens,
    outputTokens,
    model,
  });

  const stats = computeStats();
  listeners.forEach(fn => fn(stats));
}

export function getUsageStats(): UsageStats {
  return computeStats();
}

export function onUsageUpdate(fn: (stats: UsageStats) => void): () => void {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter(l => l !== fn);
  };
}
