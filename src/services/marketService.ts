import { GoogleGenAI } from "@google/genai";
import { createAI, withRetry, parseJsonResponse, generateContentWithUsage, GEMINI_MODEL } from "./geminiService";
import { getMarketOverviewPrompt, getDailyReportPrompt } from "./prompts";
import { MarketOverview, GeminiConfig, Market } from "../types";
import { getHistoryContext, saveAnalysisToHistory } from "./adminService";

let marketCache: Record<string, { data: MarketOverview; timestamp: number }> = {};

export async function getMarketOverview(config?: GeminiConfig, market: Market = "A-Share", forceRefresh: boolean = false): Promise<MarketOverview> {
  if (!forceRefresh && marketCache[market]) {
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
    const result = await generateContentWithUsage(ai, {
      model: config?.model || GEMINI_MODEL,
      contents: prompt
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
    const result = await generateContentWithUsage(ai, {
      model: config?.model || GEMINI_MODEL,
      contents: prompt
    });
    return result.text;
  });

  return response;
}
