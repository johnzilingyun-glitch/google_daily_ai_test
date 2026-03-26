import { GoogleGenAI } from "@google/genai";
import { trackRequest } from './usageTracker';

const GEMINI_MODEL = "gemini-2.5-flash-preview-05-20";

function getApiKey(config?: { apiKey?: string }): string {
  const apiKey = config?.apiKey || process.env.GEMINI_API_KEY || '';
  if (!apiKey) {
    throw new Error('请先在右上角设置中输入您的 Gemini API Key');
  }
  return apiKey;
}

// --- Request throttle: max N concurrent Gemini calls ---
const MAX_CONCURRENT = 2;
const MIN_INTERVAL_MS = 500; // minimum ms between requests
let activeCount = 0;
let lastRequestTime = 0;
const pendingQueue: Array<{ resolve: () => void }> = [];

function releaseSlot() {
  activeCount--;
  if (pendingQueue.length > 0) {
    pendingQueue.shift()!.resolve();
  }
}

async function acquireSlot(): Promise<void> {
  if (activeCount < MAX_CONCURRENT) {
    activeCount++;
    // Enforce minimum interval
    const now = Date.now();
    const wait = Math.max(0, MIN_INTERVAL_MS - (now - lastRequestTime));
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastRequestTime = Date.now();
    return;
  }
  // Wait for a slot
  await new Promise<void>(resolve => pendingQueue.push({ resolve }));
  activeCount++;
  const now = Date.now();
  const wait = Math.max(0, MIN_INTERVAL_MS - (now - lastRequestTime));
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastRequestTime = Date.now();
}

export function createAI(config?: { apiKey?: string }): GoogleGenAI {
  const ai = new GoogleGenAI({ apiKey: getApiKey(config) });

  // Wrap models.generateContent to throttle + track usage
  const origGenerateContent = ai.models.generateContent.bind(ai.models);
  ai.models.generateContent = async (params: any) => {
    await acquireSlot();
    try {
      const response = await origGenerateContent(params);
      try {
        trackRequest(response.usageMetadata, params.model || GEMINI_MODEL);
      } catch { /* tracking should never break the main flow */ }
      return response;
    } finally {
      releaseSlot();
    }
  };

  return ai;
}

export function getModelName(config?: { model: string }): string {
  return config?.model || GEMINI_MODEL;
}

export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 30000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 2000
): Promise<T> {
  let lastError: any;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      const errorStr = typeof error === 'string' ? error : (error?.message || JSON.stringify(error));
      const isRateLimit = errorStr.includes('429') ||
                          errorStr.toLowerCase().includes('quota') ||
                          errorStr.includes('RESOURCE_EXHAUSTED') ||
                          error?.status === 429;

      if (isRateLimit && attempt < maxRetries) {
        const waitTime = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
        console.warn(`Rate limit hit (429). Retrying in ${Math.round(waitTime)}ms... (Attempt ${attempt}/${maxRetries})`);
        await delay(waitTime);
        continue;
      }

      if (attempt >= maxRetries) throw error;

      await delay(1000);
    }
  }
  throw lastError;
}

export function extractJsonBlock(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return trimmed;
  }
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  throw new Error("Gemini returned a non-JSON response.");
}

export function parseJsonResponse<T>(raw: string): T {
  try {
    const parsed = JSON.parse(extractJsonBlock(raw));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      if (parsed.analysis) return parsed.analysis as T;
      if (parsed.data) return parsed.data as T;
      if (parsed.stockInfo && parsed.stockInfo.symbol) return parsed as T;
      const keys = Object.keys(parsed);
      if (keys.length === 1 && parsed[keys[0]] && typeof parsed[keys[0]] === 'object' && parsed[keys[0]].stockInfo) {
        return parsed[keys[0]] as T;
      }
    }
    return parsed as T;
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Failed to parse Gemini JSON response: ${error.message}`
        : "Failed to parse Gemini JSON response."
    );
  }
}
