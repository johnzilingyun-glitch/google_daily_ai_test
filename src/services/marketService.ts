import { GoogleGenAI } from "@google/genai";
import { createAI, withRetry, parseJsonResponse } from "./geminiService";
import { getMarketOverviewPrompt, getDailyReportPrompt } from "./prompts";
import { MarketOverview, GeminiConfig, Market } from "../types";
import { getHistoryContext, saveAnalysisToHistory } from "./adminService";

let marketCache: Record<string, { data: MarketOverview; timestamp: number }> = {};
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

export async function getMarketOverview(config?: GeminiConfig, market: Market = "A-Share"): Promise<MarketOverview> {
  if (marketCache[market] && Date.now() - marketCache[market].timestamp < CACHE_DURATION) {
    return marketCache[market].data;
  }

  const ai = createAI(config);
  const history = await getHistoryContext();
  const now = new Date();
  const beijingDate = now.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' });

  let indicesData = [];
  try {
    const res = await fetch(`/api/stock/indices?market=${market}`);
    if (res.ok) {
      indicesData = await res.json();
    }
  } catch (e) {
    console.warn('Indices tool failed, falling back to search:', e);
  }

  const prompt = getMarketOverviewPrompt(indicesData, history, beijingDate, now, market);

  const response = await withRetry(async () => {
    const result = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }]
      }
    });
    return result.text;
  });

  const overview = parseJsonResponse<MarketOverview>(response);
  
  if (overview.indices && overview.indices.length > 0) {
    marketCache[market] = { data: overview, timestamp: Date.now() };
    await saveAnalysisToHistory('market', overview);
  }

  return overview;
}

export async function getDailyReport(marketOverview: MarketOverview, config?: GeminiConfig): Promise<string> {
  const ai = createAI(config);
  const now = new Date();
  const beijingDate = now.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const prompt = getDailyReportPrompt(marketOverview, now, beijingDate);

  const response = await withRetry(async () => {
    const result = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }]
      }
    });
    return result.text;
  });

  return response;
}
