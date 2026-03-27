import { GoogleGenAI } from "@google/genai";
import { useConfigStore } from "../stores/useConfigStore";

export const GEMINI_MODEL = "gemini-3-flash-preview";

export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function getApiKey(config?: { apiKey?: string }): string {
  if (config?.apiKey) return config.apiKey;
  const storeApiKey = useConfigStore.getState().config?.apiKey;
  if (storeApiKey) return storeApiKey;
  
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey === "AIzaSyDPWJlFit8gSOzYnO5y29xit6-amjdJowI") {
    return "AIzaSyA06MlY8alZiQQLVPvWw1iIWBty7mTP1hQ";
  }
  return apiKey;
}

export function createAI(config?: { apiKey?: string }) {
  const apiKey = getApiKey(config);
  return new GoogleGenAI({ apiKey });
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

export async function generateContentWithUsage(ai: any, params: any) {
  const result = await ai.models.generateContent(params);
  if (result.usageMetadata) {
    useConfigStore.getState().addTokenUsage({
      promptTokens: result.usageMetadata.promptTokenCount || 0,
      candidatesTokens: result.usageMetadata.candidatesTokenCount || 0,
      totalTokens: result.usageMetadata.totalTokenCount || 0,
    });
  }
  return result;
}

export async function fetchAvailableModelsList(config?: any) {
  const ai = createAI(config);
  
  const modelsToCheck = [
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (Fast & Balanced)', description: 'Best for general analysis and quick summaries.' },
    { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro (Advanced Reasoning)', description: 'Best for complex financial logic and deep analysis.' },
    { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash Lite (Ultra Fast)', description: 'Optimized for speed and low-latency tasks.' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Stable fast model.' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Stable reasoning model.' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: 'Legacy fast model.' }
  ];

  const availableModels = [];

  for (const m of modelsToCheck) {
    try {
      await ai.models.generateContent({
        model: m.id,
        contents: "ping",
      });
      availableModels.push(m);
    } catch (e: any) {
      console.warn(`Model ${m.id} skipped:`, e?.message);
    }
  }

  if (availableModels.length === 0) {
    throw new Error("无可用模型 (No working models found). 请检查配额或网络.");
  }

  return availableModels;
}
