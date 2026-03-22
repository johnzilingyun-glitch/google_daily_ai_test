import { GoogleGenAI } from "@google/genai";
import { Market, MarketOverview, StockAnalysis } from "../types";

const GEMINI_MODEL = "gemini-3-flash-preview";

function getApiKey(): string {
  // Use the provided key directly to ensure it works
  const apiKey = process.env.GEMINI_API_KEY || "AIzaSyDPWJlFit8gSOzYnO5y29xit6-amjdJowI";
  
  // Only throw if it's still the placeholder or empty
  if (apiKey === "MY_GEMINI_API_KEY" || !apiKey) {
    return "AIzaSyDPWJlFit8gSOzYnO5y29xit6-amjdJowI";
  }
  return apiKey;
}

function extractJsonBlock(raw: string): string {
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

function parseJsonResponse<T>(raw: string): T {
  try {
    return JSON.parse(extractJsonBlock(raw)) as T;
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Failed to parse Gemini JSON response: ${error.message}`
        : "Failed to parse Gemini JSON response."
    );
  }
}

async function getHistoryContext(): Promise<any[]> {
  try {
    const response = await fetch('/api/admin/history-context');
    if (response.ok) {
      return await response.json();
    }
  } catch (err) {
    console.error('Failed to fetch history context:', err);
  }
  return [];
}

export async function getMarketOverview(): Promise<MarketOverview> {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const history = await getHistoryContext();
  
  const prompt = `
Current date and time: ${new Date().toISOString()}

You are a professional China-focused markets analyst.
Use Google Search grounding to gather the latest available public information.

Previous analysis context (for reference and continuity):
${JSON.stringify(history.slice(0, 3))}

Return JSON only, with no markdown fences and no explanation outside the JSON object.

Requirements:
1. Prioritize today's A-share market tone in the summary.
2. Include exactly 5 indices: SSE Composite, Shenzhen Component, ChiNext Index, CSI 300, and Hang Seng Index.
3. For each index provide: name, symbol, price, change, changePercent.
4. Include exactly 5 major financial news items from the latest market day.
5. Each news item must have title, source, time, url, and summary.
6. All user-facing text fields must be in Simplified Chinese.
7. **NEWS ACCURACY & ACCESSIBILITY**: 
   - Each "url" MUST be the exact, direct, and publicly accessible link to the SPECIFIC article.
   - **STRICTLY PROHIBITED**: Do NOT use homepages (e.g., finance.sina.com.cn), search result pages, or login-required/paywalled content.
   - **VERIFICATION**: You MUST verify that the URL actually points to the specific article described by the title.
   - **SOURCES**: Prioritize Sina Finance, East Money, and Xueqiu for A-shares; Reuters, Bloomberg, and Yahoo Finance for US-shares.
   - If a specific article URL is not available, do NOT include that news item.
   - **TEST CASE**: A valid URL should look like 'https://finance.sina.com.cn/stock/s/2024-03-22/doc-imnvvxyz1234567.shtml' not 'https://finance.sina.com.cn/'.
8. Use real source URLs, never placeholder/example URLs.
9. Continuity: Based on previous analysis, identify if trends are continuing or reversing.

JSON schema:
{
  "indices": [
    {
      "name": "string",
      "symbol": "string",
      "price": 0,
      "change": 0,
      "changePercent": 0
    }
  ],
  "topNews": [
    {
      "title": "string",
      "source": "string",
      "time": "string",
      "url": "string",
      "summary": "string"
    }
  ],
  "marketSummary": "string"
}
`.trim();

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
    },
  });

  const text = response.text;
  if (!text) throw new Error("Gemini did not return any text.");
  return parseJsonResponse<MarketOverview>(text);
}

export async function analyzeStock(symbol: string, market: Market): Promise<StockAnalysis> {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const history = await getHistoryContext();
  
  const prompt = `
Current date and time: ${new Date().toISOString()}

You are a professional equity analyst.
Analyze stock "${symbol}" in the ${market} market using the latest available public information and Google Search grounding.

Previous analysis context (for reference and continuity):
${JSON.stringify(history.filter(h => h.stockInfo?.symbol === symbol).slice(0, 3))}

Return JSON only, with no markdown fences and no explanation outside the JSON object.

Requirements:
1. Identify the actual company that matches this symbol in the specified market.
2. Provide stockInfo with symbol, name, price, change, changePercent, market, currency, lastUpdated.
3. **CRITICAL DATA ACCURACY**: 
   - You MUST search for the most recent trading data for this stock. 
   - If the market is currently open, provide the latest real-time price. 
   - If the market is closed, provide the closing price of the most recent trading session.
   - The "change" and "changePercent" MUST be calculated relative to the PREVIOUS trading day's closing price. 
   - Double-check these values against multiple reliable financial news sources (e.g., Sina Finance, East Money, Xueqiu for A-shares).
4. **DATA TYPES**: 
   - "price", "change", and "changePercent" MUST be numbers (not strings). 
   - "changePercent" should be the percentage value (e.g., 5.2 for 5.2%), not a decimal (e.g., 0.052).
5. Include 3 to 5 recent and relevant news items for this exact company.
6. **NEWS ACCURACY & ACCESSIBILITY**: 
   - Each "url" MUST be the exact, direct, and publicly accessible link to the SPECIFIC article.
   - **STRICTLY PROHIBITED**: Do NOT use homepages (e.g., finance.sina.com.cn), search result pages, or login-required/paywalled content.
   - **VERIFICATION**: You MUST verify that the URL actually points to the specific article described by the title.
   - **SOURCES**: Prioritize Sina Finance, East Money, and Xueqiu for A-shares; Reuters, Bloomberg, and Yahoo Finance for US-shares.
   - If a specific article URL is not available, do NOT include that news item.
   - **TEST CASE**: A valid URL should look like 'https://finance.sina.com.cn/stock/s/2024-03-22/doc-imnvvxyz1234567.shtml' not 'https://finance.sina.com.cn/'.
7. Provide summary, technicalAnalysis, fundamentalAnalysis, sentiment, score, recommendation, keyRisks, keyOpportunities.
8. sentiment must be one of: Bullish, Bearish, Neutral.
9. recommendation must be one of: Strong Buy, Buy, Hold, Sell, Strong Sell.
10. All long-form text fields must be in Simplified Chinese.
11. Continuity: Based on previous analysis of this stock, identify if trends are continuing or reversing.

JSON schema:
{
  "stockInfo": {
    "symbol": "string",
    "name": "string",
    "price": 0,
    "change": 0,
    "changePercent": 0,
    "market": "A-Share | HK-Share | US-Share",
    "currency": "string",
    "lastUpdated": "string"
  },
  "news": [
    {
      "title": "string",
      "source": "string",
      "time": "string",
      "url": "string",
      "summary": "string"
    }
  ],
  "summary": "string",
  "technicalAnalysis": "string",
  "fundamentalAnalysis": "string",
  "sentiment": "Bullish | Bearish | Neutral",
  "score": 0,
  "recommendation": "Strong Buy | Buy | Hold | Sell | Strong Sell",
  "keyRisks": ["string"],
  "keyOpportunities": ["string"]
}
`.trim();

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
    },
  });

  const text = response.text;
  if (!text) throw new Error("Gemini did not return any text.");
  return parseJsonResponse<StockAnalysis>(text);
}

export async function sendChatMessage(
  userMessage: string,
  analysis: StockAnalysis
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const prompt = `
You are a professional equity analyst answering a follow-up question from a user.

Existing analysis JSON:
${JSON.stringify(analysis)}

User question:
${userMessage}

Answer in Simplified Chinese.
Be concise, balanced, and practical.
If the question goes beyond the known analysis, say so clearly instead of inventing facts.
`.trim();

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
  });

  const text = response.text;
  if (!text) throw new Error("Gemini did not return any text.");
  return text;
}

export async function getStockReport(analysis: StockAnalysis): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const prompt = `
    基于以下个股分析数据，生成一份简洁、专业的个股研究简报。
    报告应包含：
    1. 股票基本信息（名称、代码、当前价格、涨跌幅）。
    2. 核心观点总结（1-2句）。
    3. 技术面与基本面核心要点。
    4. AI 投资建议与风险提示。
    
    分析数据：
    ${JSON.stringify(analysis)}
    
    请使用 Markdown 格式，语气专业且客观。
    回答语言：简体中文。
  `.trim();

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  const text = response.text;
  if (!text) throw new Error("Gemini did not return any text.");
  return text;
}

export async function getChatReport(stockName: string, chatHistory: { role: 'user' | 'ai'; content: string }[]): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const prompt = `
    基于以下关于股票 "${stockName}" 的 AI 深度追问对话历史，生成一份简洁、专业的整理报告。
    报告应包含：
    1. 用户关注的核心问题总结。
    2. AI 提供的主要观点和建议。
    3. 最终的行动建议或风险提示。
    
    对话历史：
    ${chatHistory.map(m => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content}`).join('\n\n')}
    
    请使用 Markdown 格式，语气专业且客观。
    回答语言：简体中文。
  `.trim();

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  const text = response.text;
  if (!text) throw new Error("Gemini did not return any text.");
  return text;
}

export async function getDailyReport(marketOverview: MarketOverview): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const prompt = `
    基于以下市场概况，生成一份简洁、专业的每日股市分析报告。
    报告应包含：
    1. 市场核心观点总结（1-2句）。
    2. 3个值得关注的板块或概念，并简要说明理由。
    3. 3只今日推荐关注的个股（包含股票代码和推荐理由）。
    
    市场概况：
    ${JSON.stringify(marketOverview)}
    
    请使用 Markdown 格式，语气专业且客观。
    回答语言：简体中文。
  `.trim();

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  const text = response.text;
  if (!text) throw new Error("Gemini did not return any text.");
  return text;
}
