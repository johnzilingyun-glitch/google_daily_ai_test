import { GoogleGenAI } from "@google/genai";
import { createAI, withRetry, parseJsonResponse } from "./geminiService";
import { getAnalyzeStockPrompt, getChatMessagePrompt, getStockReportPrompt, getDiscussionReportPrompt } from "./prompts";
import { Market, StockAnalysis, AgentMessage, Scenario, AgentDiscussion, GeminiConfig } from "../types";
import { getHistoryContext, saveAnalysisToHistory } from "./adminService";

export async function analyzeStock(symbol: string, market: Market, config?: GeminiConfig): Promise<StockAnalysis> {
  const ai = createAI(config);
  const history = await getHistoryContext();
  const now = new Date();
  const beijingDate = now.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const beijingShortDate = beijingDate.split('/').slice(1).join('/');

  let realtimeData = null;
  try {
    const res = await fetch(`/api/stock/realtime?symbol=${encodeURIComponent(symbol)}&market=${market}`);
    if (res.ok) {
      realtimeData = await res.json();
    }
  } catch (e) {
    console.warn('Real-time tool failed, falling back to search:', e);
  }

  const prompt = getAnalyzeStockPrompt(symbol, market, realtimeData, history, beijingDate, beijingShortDate, now);

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

  const analysis = parseJsonResponse<StockAnalysis>(response);
  
  if (analysis.stockInfo) {
    await saveAnalysisToHistory('stock', analysis);
  }

  return analysis;
}

export async function sendChatMessage(userMessage: string, analysis: StockAnalysis, config?: GeminiConfig): Promise<string> {
  const ai = createAI(config);
  const prompt = getChatMessagePrompt(userMessage, analysis);

  const response = await withRetry(async () => {
    const result = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt
    });
    return result.text;
  });

  return response;
}

export async function getStockReport(analysis: StockAnalysis, config?: GeminiConfig): Promise<string> {
  const ai = createAI(config);
  const prompt = getStockReportPrompt(analysis);

  const response = await withRetry(async () => {
    const result = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt
    });
    return result.text;
  });

  return response;
}

export async function getChatReport(stockName: string, chatHistory: { role: string; content: string }[], config?: GeminiConfig): Promise<string> {
  const ai = createAI(config);
  const prompt = `
    Based on the following chat history about ${stockName}, generate a concise summary report.
    
    Chat History:
    ${JSON.stringify(chatHistory)}
    
    Format the output in Markdown.
  `.trim();

  const response = await withRetry(async () => {
    const result = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt
    });
    return result.text;
  });

  return response;
}

export async function getDiscussionReport(
  analysis: StockAnalysis, 
  discussion: AgentMessage[], 
  scenarios?: Scenario[], 
  backtestResult?: any,
  config?: GeminiConfig
): Promise<string> {
  const ai = createAI(config);
  const prompt = getDiscussionReportPrompt(analysis, discussion, scenarios, backtestResult);

  const response = await withRetry(async () => {
    const result = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt
    });
    return result.text;
  });

  return response;
}
