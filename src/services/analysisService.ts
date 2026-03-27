import { GoogleGenAI } from "@google/genai";
import { createAI, withRetry, parseJsonResponse, generateContentWithUsage, GEMINI_MODEL } from "./geminiService";
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
  const res = await fetch(`/api/stock/realtime?symbol=${encodeURIComponent(symbol)}&market=${market}`);
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `无法获取股票信息，请检查代码或拼写。`);
  }
  realtimeData = await res.json();
  const symMatch = (realtimeData.symbol || '').toUpperCase();
  if (market === 'A-Share' && !(symMatch.endsWith('.SS') || symMatch.endsWith('.SZ') || symMatch.endsWith('.BJ'))) {
    throw new Error(`请核实查询代码及范围：无法在 A 股 中找到 "${symbol}"。你可能输入了非A股代码。`);
  }
  if (market === 'HK-Share' && !symMatch.endsWith('.HK')) {
    throw new Error(`请核实查询代码及范围：无法在 港股 中找到 "${symbol}"。你可能输入了非港股代码。`);
  }

  const prompt = getAnalyzeStockPrompt(symbol, market, realtimeData, history, beijingDate, beijingShortDate, now);

  const response = await withRetry(async () => {
    const result = await generateContentWithUsage(ai, {
      model: config?.model || GEMINI_MODEL,
      contents: prompt
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
    const result = await generateContentWithUsage(ai, {
      model: config?.model || GEMINI_MODEL,
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
    const result = await generateContentWithUsage(ai, {
      model: config?.model || GEMINI_MODEL,
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
    const result = await generateContentWithUsage(ai, {
      model: config?.model || GEMINI_MODEL,
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
    const result = await generateContentWithUsage(ai, {
      model: config?.model || GEMINI_MODEL,
      contents: prompt
    });
    return result.text;
  });

  return response;
}
