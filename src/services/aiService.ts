import { GoogleGenAI } from "@google/genai";
import { Market, MarketOverview, StockAnalysis, AgentMessage, AgentRole, StockInfo } from "../types";

const GEMINI_MODEL = "gemini-3-flash-preview";

/**
 * Helper to add delay between API calls
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Robust retry wrapper for Gemini API calls
 */
async function withRetry<T>(
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
      const isRateLimit = error?.message?.includes('429') || 
                          error?.message?.includes('quota') || 
                          error?.status === 429;
      
      if (isRateLimit && attempt < maxRetries) {
        // Exponential backoff with jitter
        const waitTime = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
        console.warn(`Rate limit hit (429). Retrying in ${Math.round(waitTime)}ms... (Attempt ${attempt}/${maxRetries})`);
        await delay(waitTime);
        continue;
      }
      
      if (attempt >= maxRetries) throw error;
      
      // For other errors, shorter delay
      await delay(1000);
    }
  }
  throw lastError;
}

function getApiKey(): string {
  // Use the provided key directly to ensure it works
  const apiKey = process.env.GEMINI_API_KEY || "AIzaSyDPWJlFit8gSOzYnO5y29xit6-amjdJowI";
  
  // Only throw if it's still the placeholder or empty
  if (apiKey === "MY_GEMINI_API_KEY" || !apiKey) {
    return "AIzaSyDPWJlFit8gSOzYnO5y29xit6-amjdJowI";
  }
  return apiKey;
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

export function validateStockInfo(info: StockInfo): void {
  const now = new Date();
  const beijingDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
  
  // 1. Check if lastUpdated contains today's date
  if (!info.lastUpdated.includes(beijingDate)) {
    // If it's early morning (before 9:30 AM), it might be yesterday's data, which is acceptable
    const hour = parseInt(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', hour12: false }).format(now));
    if (hour >= 10 && !info.lastUpdated.includes(beijingDate)) {
      throw new Error(`STALE DATA DETECTED: Expected data for ${beijingDate}, but got ${info.lastUpdated}. AI must find today's data.`);
    }
  }

  // 2. Check Beijing Time format
  if (!info.lastUpdated.endsWith('CST')) {
    throw new Error(`Invalid time format: ${info.lastUpdated}. Must end with CST.`);
  }

  // 3. Check for zero values that might indicate failure
  if (info.price <= 0) {
    throw new Error(`Invalid price: ${info.price}. Price must be positive.`);
  }

  // 4. Check for price limits (A-Share usually 10%, ChiNext/STAR 20%)
  if (info.market === "A-Share") {
    const limit = info.symbol.startsWith('30') || info.symbol.startsWith('68') ? 0.21 : 0.11;
    const actualChangePercent = Math.abs(info.changePercent) / 100;
    if (actualChangePercent > limit) {
      throw new Error(`Price change ${info.changePercent}% exceeds market limit for ${info.symbol}. This is likely a hallucination.`);
    }
  }

  // 5. Check calculation consistency
  const calculatedChange = parseFloat((info.price - info.previousClose).toFixed(4));
  const diff = Math.abs(calculatedChange - info.change);
  if (diff > 0.02) {
    throw new Error(`Calculation mismatch: Price(${info.price}) - PrevClose(${info.previousClose}) = ${calculatedChange}, but AI reported ${info.change}.`);
  }

  // 6. Check daily range if available
  if (info.dailyHigh !== undefined && info.dailyLow !== undefined) {
    if (info.price > info.dailyHigh || info.price < info.dailyLow) {
      throw new Error(`Price ${info.price} is outside daily range [${info.dailyLow}, ${info.dailyHigh}].`);
    }
  }

  // 7. Check currency
  if (info.market === "A-Share" && info.currency !== "CNY") {
    throw new Error(`Currency mismatch for A-Share: Expected CNY, got ${info.currency}`);
  }
}

export function validateMarketOverview(overview: MarketOverview): void {
  if (!overview) {
    throw new Error("Market overview data is null or undefined.");
  }
  if (!overview.indices) {
    throw new Error("Market overview is missing 'indices' property at the root level.");
  }
  if (!Array.isArray(overview.indices) || overview.indices.length === 0) {
    throw new Error("Market overview 'indices' must be a non-empty array.");
  }

  // Check if summary contains source info as required by prompt
  if (!overview.marketSummary || (!overview.marketSummary.includes('Source:') && !overview.marketSummary.includes('来源'))) {
    console.warn("Market summary is missing source attribution.");
  }
}

export function parseJsonResponse<T>(raw: string): T {
  try {
    const parsed = JSON.parse(extractJsonBlock(raw));
    // If the AI wrapped the result in a property like "analysis" or "data"
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      if (parsed.analysis) return parsed.analysis as T;
      if (parsed.data) return parsed.data as T;
      if (parsed.stockInfo && parsed.stockInfo.symbol) return parsed as T;
      // If it's a single property object where the property name is the symbol or something else
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

async function saveAnalysisToHistory(type: 'market' | 'stock', data: any) {
  try {
    await fetch('/api/admin/save-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, data })
    });
  } catch (err) {
    console.error('Failed to save analysis to history:', err);
  }
}

async function logOptimization(field: string, oldValue: any, newValue: any, description: string) {
  try {
    await fetch('/api/admin/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field, oldValue, newValue, description })
    });
  } catch (err) {
    console.error('Failed to log optimization:', err);
  }
}

let marketOverviewCache: { data: MarketOverview; timestamp: number } | null = null;
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

export async function getMarketOverview(): Promise<MarketOverview> {
  // Check cache first
  const nowTime = Date.now();
  if (marketOverviewCache && (nowTime - marketOverviewCache.timestamp < CACHE_DURATION)) {
    console.log('Returning market overview from cache');
    return marketOverviewCache.data;
  }

  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const history = await getHistoryContext();
  const now = new Date();
  const beijingDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
  
  // Fetch major indices data in batch
  const indicesSymbols = [
    '000001.SS', // SSE Composite
    '399001.SZ', // Shenzhen Component
    '399006.SZ', // ChiNext Index
    '000300.SS', // CSI 300
    '^HSI'       // Hang Seng Index
  ];
  
  let indicesData: any[] = [];
  try {
    const response = await fetch(`/api/stock/realtime?symbols=${indicesSymbols.join(',')}`);
    if (response.ok) {
      indicesData = await response.json();
    }
  } catch (e) {
    console.error('Failed to fetch batch indices:', e);
  }
  
  const result = await withRetry(async () => {
    const prompt = `
Current date and time (UTC): ${now.toISOString()}
Current date and time (China Standard Time): ${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}

**REAL-TIME INDICES DATA (GROUND TRUTH)**:
${JSON.stringify(indicesData, null, 2)}

You are a professional China-focused markets analyst.
Use Google Search grounding to gather the latest available public information.
If the current time in China is past 15:00 CST, you MUST prioritize fetching the "Closing Price" (收盘价) for A-share indices.

Previous analysis context (for reference and continuity):
${JSON.stringify(history.slice(0, 3))}

Return JSON only, with no markdown fences and no explanation outside the JSON object.
**IMPORTANT**: The JSON MUST have "indices" at the root level. Do NOT wrap the entire response in another object like "marketOverview" or "data".

Requirements:
1. **STRICT JSON STRUCTURE (CRITICAL)**: The root object MUST contain the "indices" array.
2. Prioritize today's A-share market tone in the summary.
3. Include exactly 5 indices: SSE Composite, Shenzhen Component, ChiNext Index, CSI 300, and Hang Seng Index.
4. For each index provide: name, symbol, price, change, changePercent.
**SEARCH STRATEGY (CRITICAL)**: 
   - You MUST use Google Search to find the *real-time* or *latest* values for these indices. 
   - Search query should be something like: "SSE Composite index ${beijingDate}", "上证指数 ${beijingDate} 收盘价", or "CSI 300 ${beijingDate} 东方财富".
   - **DO NOT** rely on your internal knowledge for the current values. 
   - **VERIFY THE DATE & TIME (STRICT)**: You MUST verify that the data is for TODAY (${beijingDate}). If you only find data from a previous day, you MUST state "Warning: Today's data not yet available, showing data from [Date]" in the summary.
   - **RELIABLE SOURCES (PRIORITY)**: Prioritize data from **Sina Finance (新浪财经)**, **East Money (东方财富)**, or **Xueqiu (雪球)**. These are the most authoritative for A-shares.
**CRITICAL DATA ACCURACY**: 
   - You MUST search for the most recent trading data for these indices. 
   - Cross-reference at least TWO authoritative sources (e.g., Sina Finance, East Money, Xueqiu, Baidu Stock) to verify the current price and change.
   - **MANUAL VERIFICATION**: For each index, find the "Previous Close" (昨收) and "Current Price" (现价). Calculate the change and changePercent manually to ensure accuracy.
   - **SOURCE NAMING**: You MUST explicitly state the source name (e.g., "Source: Sina Finance") AND the direct URL of the financial page you used for the index data at the end of the "summary" field.
   - **BEIJING TIME (CRITICAL)**: For A-shares and HK-shares, all times MUST be in Beijing Time (CST). The "lastUpdated" field MUST be in "YYYY-MM-DD HH:mm:ss CST" format.
   - Ensure the data is from TODAY'S trading session if the market is open. Note the source and time (with timezone, e.g. UTC+8) in the summary. Briefly mention the calculation used for indices (e.g., "Price 3000 - Prev Close 3010 = -10 (-0.33%)").
   - **DATA INTEGRITY CHECK**: If the "change" or "changePercent" is exactly 0, verify if the stock was suspended or if it's a non-trading day. Check the "Turnover" (成交额) to confirm trading activity.
4. **SECTOR ANALYSIS (NEW)**: Analyze current hot sectors (板块) and provide a conclusion for each.
5. **COMMODITY ANALYSIS (NEW)**: Analyze major commodity trends (e.g., Gold, Oil, Copper) and provide expected analysis.
6. **RECOMMENDATIONS**: Provide recommended stocks or sectors based on the above analysis.
7. Include exactly 5 major financial news items from the latest market day.
8. Each news item must have title, source, time, url, and summary.
9. All user-facing text fields must be in Simplified Chinese.
10. **ANTI-HALLUCINATION (CRITICAL)**: If you cannot find the data, state it clearly in the summary. Do NOT invent numbers.
11. **NEWS ACCURACY & ACCESSIBILITY (CRITICAL)**: 
   - Each "url" MUST be the exact, direct, and publicly accessible link to the SPECIFIC article.
   - **STRICTLY PROHIBITED**: Do NOT use homepages (e.g., finance.sina.com.cn), search result pages, or login-required/paywalled content.
   - **VERIFICATION**: You MUST verify that the URL actually points to the specific article described by the title.
   - **SOURCES**: Prioritize authoritative and highly accessible sources: Sina Finance (新浪财经), East Money (东方财富), Xueqiu (雪球), and Phoenix Finance (凤凰财经).
   - **AVOID**: Avoid sources that frequently have broken links or paywalls like Economic Observer (经济观察网 - eeo.com.cn) unless you are certain the link is public.
   - If a specific article URL is not available, do NOT include that news item.
   - **LATEST DATA**: Use Google Search to ensure all news and data are from the most recent trading session or the current day.
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
      "changePercent": 0,
      "previousClose": 0
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
  "sectorAnalysis": [
    {
      "name": "string",
      "trend": "string",
      "conclusion": "string"
    }
  ],
  "commodityAnalysis": [
    {
      "name": "string",
      "trend": "string",
      "expectation": "string"
    }
  ],
  "recommendations": [
    {
      "type": "Stock | Sector",
      "name": "string",
      "reason": "string"
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
    const result = parseJsonResponse<MarketOverview>(text);
    
    // Runtime validation
    validateMarketOverview(result);
    
    // Auto-save to history
    void saveAnalysisToHistory('market', result);
    void logOptimization('market_overview', 'fetch', (result.marketSummary || '').slice(0, 50), 'Fetched latest market overview');
    
    return result;
  }, 5, 5000); // Increased retries and base delay for market overview

  // Update cache
  marketOverviewCache = {
    data: result,
    timestamp: Date.now()
  };

  return result;
}

async function getRealtimeStockData(symbol: string, market: Market): Promise<any> {
  try {
    const response = await fetch(`/api/stock/realtime?symbol=${encodeURIComponent(symbol)}&market=${encodeURIComponent(market)}`);
    if (response.ok) {
      return await response.json();
    }
  } catch (err) {
    console.error('Failed to fetch real-time stock data from API:', err);
  }
  return null;
}

export async function analyzeStock(symbol: string, market: Market): Promise<StockAnalysis> {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const history = await getHistoryContext();
  const now = new Date();
  const beijingDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
  const beijingShortDate = beijingDate.slice(5); // MM-DD
  
  // Fetch real-time data from our new tool first
  const realtimeData = await getRealtimeStockData(symbol, market);
  
  return withRetry(async () => {
    const prompt = `
Current date and time (UTC): ${now.toISOString()}
Current date and time (China Standard Time): ${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}

**REAL-TIME DATA TOOL OUTPUT (GROUND TRUTH)**:
${realtimeData ? JSON.stringify(realtimeData, null, 2) : "No real-time data available from tool. Use Google Search grounding instead."}

You are a professional equity analyst.
Analyze stock "${symbol}" in the ${market} market using the latest available public information and Google Search grounding.
If the real-time data above is available, it is your PRIMARY source for price, change, and previous close.
If the current time in China is past 15:00 CST (for A-shares) or 16:00 HKT (for HK-shares), you MUST prioritize fetching the "Closing Price" (收盘价).

Previous analysis context (for reference and continuity):
${JSON.stringify(history.filter(h => h.stockInfo?.symbol === symbol).slice(0, 3))}

Return JSON only, with no markdown fences and no explanation outside the JSON object.
**IMPORTANT**: The JSON MUST have "stockInfo" at the root level. Do NOT wrap the entire response in another object like "analysis" or "data".

Requirements:
1. **STRICT MARKET ADHERENCE (CRITICAL)**: 
   - You MUST identify the company that matches this symbol SPECIFICALLY in the ${market} market. 
   - **NAME-TO-CODE RESOLUTION**: If "${symbol}" is a company name (e.g., "佳力图"), you MUST first find its official stock code (e.g., 603912.SH) before searching for price data. Ensure the suffix (.SH, .SZ, .HK) matches the ${market}.
   - **A-SHARE PINYIN SUPPORT**: For the A-Share market, the search term "${symbol}" might be a 6-digit code (e.g., 600989) OR a pinyin abbreviation (e.g., "BFNY" for 宝丰能源). You MUST resolve these abbreviations to the correct A-share stock.
   - If the symbol exists in multiple markets (e.g., "AAPL" in US vs "AAPL" as a placeholder elsewhere), you MUST prioritize the ${market} version.
   - The "market" field in the returned JSON MUST be exactly "${market}".
   - If the symbol is NOT found in the ${market} market, return an error in the "summary" field and provide empty data for other fields, but DO NOT return a stock from a different market.
2. Provide stockInfo with symbol, name, price, change, changePercent, market, currency, lastUpdated, and **previousClose** (the closing price of the previous trading day).
3. **SEARCH STRATEGY (CRITICAL)**: 
   - You MUST use Google Search to find the *real-time* or *latest* price for "${symbol}" in the ${market} market. 
   - **SPECIFIC SEARCH QUERIES**: Use queries like:
     - "${symbol} ${beijingDate} 现价 昨收 涨跌"
     - "${symbol} 东方财富 实时行情"
     - "${symbol} sina finance stock price today"
   - **DO NOT** rely on your internal knowledge for the current price. 
   - **VERIFY THE DATE & TIME (STRICT)**: You MUST verify that the data is for TODAY (${beijingDate}). 
   - **SNIPPET VERIFICATION**: Look for "${beijingShortDate}" or "今日" in the search result snippets. If you only find a previous date or "昨日", the data is STALE and you MUST keep searching or state it's unavailable.
   - **RELIABLE SOURCES (PRIORITY)**: Prioritize data from **Sina Finance (新浪财经)**, **East Money (东方财富)**, or **Xueqiu (雪球)**. These are the most authoritative for A-shares.
4. **FUNDAMENTAL DATA (NEW)**: Provide specific fundamental data (e.g., PE, PB, ROE, EPS, Revenue Growth).
5. **VALUATION LEVEL (NEW)**: Provide current "water level" (水位) - valuation percentile compared to historical data.
6. **HISTORICAL CONTEXT (NEW)**: Include historical price ranges and major historical events affecting the stock.
7. **CRITICAL DATA ACCURACY (HIGH PRIORITY)**: 
   - You MUST search for the most recent trading data for this stock. 
   - **CROSS-REFERENCE (MANDATORY)**: You MUST cross-reference at least TWO authoritative financial sources to verify the current price, previous close, change, and changePercent.
   - **MARKET STATUS**: Determine if the market is currently open or closed. If open, provide real-time data. If closed, provide the latest closing data.
   - **CALCULATION CHECK (CRITICAL)**: The "change" MUST be (Current Price - Previous Close). The "changePercent" MUST be (Change / Previous Close * 100). 
   - **EXAMPLE CHECK**: For ${symbol} on ${beijingDate}, if the price is X and it rose from Y, the change is (X-Y). If you report old data, you will fail validation. DOUBLE CHECK THE DATE.
   - **PREVENT SWAPPING (CRITICAL)**: Double check if you are swapping "Current Price" and "Previous Close". "Previous Close" is the price from the END of the PREVIOUS trading day. "Current Price" is the price as of today.
   - **SOURCE NAMING**: You MUST explicitly state the source name (e.g., "Source: Sina Finance") AND the direct URL of the financial page you used for the price data at the end of the "summary" field.
   - **BEIJING TIME (CRITICAL)**: For A-shares and HK-shares, all times MUST be in Beijing Time (CST). The "lastUpdated" field MUST be in "YYYY-MM-DD HH:mm:ss CST" format.
   - **REASONABLENESS CHECK**: If the price is significantly different from the previous close or historical ranges, you MUST double-check the stock code and market.
   - **NAME VERIFICATION**: Ensure the company name matches the stock code exactly.
   - **TIMESTAMP**: The "lastUpdated" field MUST reflect the actual time of the data point (e.g., "${beijingDate} 15:00 CST").
   - If there is a discrepancy between sources, prioritize the most recent one and note the source, time, and the "Previous Close" value used for calculation in the "summary". Also explicitly mention the calculation steps (e.g., "Price 10.5 - Prev Close 10.6 = -0.1 (-0.94%)").
   - **DATA INTEGRITY CHECK**: If the "change" or "changePercent" is exactly 0, verify if the stock was suspended or if it's a non-trading day. Check the "Turnover" (成交额) to confirm trading activity.
   - **DAILY RANGE CHECK**: You MUST find the "Daily High" (最高) and "Daily Low" (最低). The "Current Price" MUST be within this range. If not, you MUST re-verify the data.
8. **DATA TYPES**: 
   - "price", "change", and "changePercent" MUST be numbers (not strings). Ensure the "price" matches the "currency" (e.g., CNY for A-shares). Double-check the sign of "change" and "changePercent" (negative for price drops).
   - "changePercent" should be the percentage value (e.g., 5.2 for 5.2% increase, -0.7 for 0.7% decrease), not a decimal (e.g., 0.052).
9. Include 3 to 5 recent and relevant news items for this exact company.
10. **NEWS ACCURACY & ACCESSIBILITY (CRITICAL)**: 
   - Each "url" MUST be the exact, direct, and publicly accessible link to the SPECIFIC article.
   - **STRICTLY PROHIBITED**: Do NOT use homepages (e.g., finance.sina.com.cn), search result pages, or login-required/paywalled content.
   - **VERIFICATION**: You MUST verify that the URL actually points to the specific article described by the title.
   - **SOURCES**: Prioritize authoritative and highly accessible sources: Sina Finance (新浪财经), East Money (东方财富), Xueqiu (雪球), and Phoenix Finance (凤凰财经).
   - **AVOID**: Avoid sources that frequently have broken links or paywalls like Economic Observer (经济观察网 - eeo.com.cn) unless you are certain the link is public.
   - If a specific article URL is not available, do NOT include that news item.
   - **LATEST DATA**: Use Google Search to ensure all news and data are from the most recent trading session or the current day.
   - **TEST CASE**: A valid URL should look like 'https://finance.sina.com.cn/stock/s/2024-03-22/doc-imnvvxyz1234567.shtml' not 'https://finance.sina.com.cn/'.
11. Provide summary, technicalAnalysis, fundamentalAnalysis, sentiment, score, recommendation, keyRisks, keyOpportunities, and a detailed tradingPlan.
12. **MARGIN OF SAFETY (NEW)**: Incorporate "Margin of Safety" (安全边际) theory into the fundamental analysis and trading plan.
13. **TRADING PLAN LOGIC (NEW)**: 
    - If the recommendation is NOT "Buy" or "Strong Buy", the tradingPlan should state "Not Recommended" (不推荐) for entryPrice, targetPrice, and stopLoss. 
    - Do NOT provide specific price levels if not recommended.
    - **STRATEGY RISKS (NEW)**: Clearly state the specific risks associated with the recommended entry/target/stop-loss levels (e.g., "if stop-loss is too tight, it may be triggered by normal volatility"). This is separate from general keyRisks.
14. tradingPlan must include: entryPrice, targetPrice, stopLoss, strategy, and strategyRisks (all as strings).
15. sentiment must be one of: Bullish, Bearish, Neutral.
16. recommendation must be one of: Strong Buy, Buy, Hold, Sell, Strong Sell.
17. All long-form text fields must be in Simplified Chinese.
18. Continuity: Based on previous analysis of this stock, identify if trends are continuing or reversing.
19. **ANTI-HALLUCINATION (CRITICAL)**: If you cannot find the data, state it clearly in the summary. Do NOT invent numbers.
20. **REASONABLENESS CHECK**: If the price is significantly different from the previous close or historical ranges, you MUST double-check if you have the correct stock and market.

JSON schema:
{
  "stockInfo": {
    "symbol": "string",
    "name": "string",
    "price": 0,
    "change": 0,
    "changePercent": 0,
    "market": "${market}",
    "currency": "string",
    "lastUpdated": "string",
    "previousClose": 0,
    "dailyHigh": 0,
    "dailyLow": 0
  },
  "fundamentals": {
    "pe": "string",
    "pb": "string",
    "roe": "string",
    "eps": "string",
    "revenueGrowth": "string",
    "valuationPercentile": "string"
  },
  "historicalData": {
    "yearHigh": "string",
    "yearLow": "string",
    "majorEvents": ["string"]
  },
  "valuationAnalysis": {
    "comparison": "string",
    "marginOfSafetySummary": "string"
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
  "keyOpportunities": ["string"],
  "tradingPlan": {
    "entryPrice": "string",
    "targetPrice": "string",
    "stopLoss": "string",
    "strategy": "string",
    "strategyRisks": "string"
  }
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
    const result = parseJsonResponse<StockAnalysis>(text);
    
    if (!result.stockInfo) {
      throw new Error("AI 分析结果中缺少股票基本信息 (stockInfo)。请重试。");
    }

    // Runtime validation
    validateStockInfo(result.stockInfo);

    // Force market to requested market if it's missing or slightly different
    if (result.stockInfo.market !== market) {
      result.stockInfo.market = market;
    }
    
    // Auto-save to history
    void saveAnalysisToHistory('stock', result);
    void logOptimization('stock_analysis', symbol, result.recommendation, `Analyzed stock ${symbol}`);
    
    return result;
  }, 3, 3000);
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

  const response = await withRetry(async () => {
    return await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
    });
  }, 3, 2000);

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

  const response = await withRetry(async () => {
    return await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });
  }, 3, 3000);

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

  const response = await withRetry(async () => {
    return await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });
  }, 3, 3000);

  const text = response.text;
  if (!text) throw new Error("Gemini did not return any text.");
  return text;
}

export async function runAgentDiscussion(
  analysis: StockAnalysis,
  onMessage: (msg: AgentMessage) => void
): Promise<string> {
  if (!analysis || !analysis.stockInfo) {
    throw new Error("Invalid analysis data: missing stockInfo.");
  }

  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  
  // Define the multi-round discussion flow
  const discussionFlow: { role: AgentRole; task: string }[] = [
    { role: "Technical Analyst", task: "Provide initial technical analysis based on charts and indicators." },
    { role: "Fundamental Analyst", task: "Provide initial fundamental analysis based on financial data and valuation." },
    { role: "Sentiment Analyst", task: "Provide initial sentiment analysis based on news and market mood." },
    { role: "Risk Manager", task: "Critique the previous analyses. Identify potential pitfalls, hidden risks, and why the bull/bear case might be wrong." },
    { role: "Technical Analyst", task: "Respond to the Risk Manager's critique. Refine your technical outlook based on the risks identified." },
    { role: "Fundamental Analyst", task: "Respond to the Risk Manager's critique. Refine your fundamental outlook and 'Margin of Safety' calculation." },
    { role: "Moderator", task: "Summarize the entire multi-round discussion. Provide a final, rational judgment and a clear conclusion with a definitive recommendation." }
  ];

  let discussionHistory = `
    Initial Analysis:
    ${JSON.stringify(analysis)}
  `;

  for (const step of discussionFlow) {
    const prompt = `
      You are a ${step.role} in a multi-agent stock analysis team.
      The team is conducting a DEEP, MULTI-ROUND discussion on the stock: ${analysis.stockInfo?.name || 'Unknown'} (${analysis.stockInfo?.symbol || 'Unknown'}).
      
      Current Discussion History:
      ${discussionHistory}
      
      Your Specific Task in this round:
      - ${step.task}
      - **RATIONAL JUDGMENT (CRITICAL)**: Be objective. Do not just follow the trend. If you see a reason to be cautious, state it clearly.
      - **FORMATTING**: Use Markdown. Use bold text for key terms, bullet points for lists.
      - **DATA-DRIVEN**: Use specific data points (PE, PB, ROE, RSI, MACD, etc.).
      - **MARGIN OF SAFETY**: Always consider the "Margin of Safety" (安全边际).
      - React specifically to points made by other analysts in previous rounds.
      - Keep your response concise but insightful (max 300 words).
      - Language: Simplified Chinese.
      
      If you are the "Moderator":
      - Synthesize all conflicting views.
      - Provide a final "Final Conclusion" (最终结论).
      - If the consensus is not positive or risks are too high, explicitly state "Not Recommended" (不推荐) in the trading plan section.
    `.trim();

    const response = await withRetry(async () => {
      return await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
      });
    }, 3, 4000); // Higher base delay for discussion rounds

    const content = response.text || "No response.";
    const msg: AgentMessage = {
      id: `${step.role}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      role: step.role,
      content,
      timestamp: new Date().toISOString()
    };
    
    onMessage(msg);
    discussionHistory += `\n\n[${step.role}]: ${content}`;
    
    // Add a small delay between rounds to avoid rate limits
    await delay(1500);
  }

  // Log the discussion completion
  void logOptimization('agent_discussion', analysis.stockInfo.symbol, 'completed', `Multi-agent discussion completed for ${analysis.stockInfo.symbol}`);

  return discussionHistory;
}

export async function getDiscussionReport(analysis: StockAnalysis, discussion: AgentMessage[]): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const prompt = `
    基于以下个股分析数据和 AI 专家组联席会议的研讨记录，生成一份完整的个股深度研究报告。
    
    报告应包含：
    1. 🚀 **股票基本信息**：名称、代码、当前价格、涨跌幅。
    2. 📊 **核心财务指标**：PE, PB, ROE, EPS 等关键数据及当前估值水位。
    3. 🧠 **AI 专家组研讨摘要**：
       - 技术面、基本面（结合安全边际）、情绪面、风险管理各方的核心观点。
       - 研讨中的主要分歧或共识点。
    4. 🎯 **首席策略师最终结论**：明确的操作建议（买入/持有/卖出）。
    5. 🛡️ **安全边际评估**：基于安全边际理论的深度评价。
    6. 📈 **交易计划**：
       - 如果推荐：建议买入价、目标价、止损价。
       - 如果不推荐：明确标注“不推荐”，不提供具体价格。
    7. ⚠️ **核心机会与风险提示**。
    
    分析数据：
    ${JSON.stringify(analysis)}
    
    研讨记录：
    ${discussion.map(m => `[${m.role}]: ${m.content}`).join('\n\n')}
    
    请使用 Markdown 格式，语气专业、客观且深度。
    使用丰富的 Emoji 增加可读性。
    针对飞书界面进行优化：使用清晰的分级标题，重要的数字加粗显示。
    回答语言：简体中文。
  `.trim();

  const response = await withRetry(async () => {
    return await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });
  }, 3, 3000);

  const text = response.text;
  if (!text) throw new Error("Gemini did not return any text.");
  return text;
}

export async function getDailyReport(marketOverview: MarketOverview): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const prompt = `
    Current date and time: ${new Date().toISOString()}
    
    You are a professional China-focused markets analyst.
    Use Google Search grounding to gather the latest available public information about the market situation from the previous day or the weekend.
    
    Market Overview Data (for context):
    ${JSON.stringify(marketOverview)}
    
    Requirements:
    1. Summarize the A-share market tone (previous day or weekend news).
    2. Include key indices performance (SSE, SZSE, ChiNext, CSI 300, HSI).
    3. List 3-5 major financial news items.
    4. **NEWS ACCURACY & ACCESSIBILITY (CRITICAL)**: 
       - Each news item MUST include a direct, publicly accessible URL to the SPECIFIC article.
       - **STRICTLY PROHIBITED**: Do NOT use homepages (e.g., finance.sina.com.cn), search result pages, or login-required/paywalled content.
       - **SOURCES**: Prioritize authoritative and highly accessible sources: Sina Finance (新浪财经), East Money (东方财富), Xueqiu (雪球), and Phoenix Finance (凤凰财经).
       - **AVOID**: Avoid sources that frequently have broken links or paywalls like Economic Observer (经济观察网 - eeo.com.cn) unless you are certain the link is public.
       - **LATEST DATA**: Use Google Search to ensure all news and data are from the most recent trading session or the current day.
    5. Provide a prediction for today's market opening and trend.
    6. Recommend 3 stocks or sectors to watch today with brief reasons.
    7. Format the output in Markdown, suitable for a Feishu message.
    8. Use rich Emojis and clear section dividers (---) to make it look like a professional newsletter.
    9. Language: Simplified Chinese.
    
    Structure:
    # 📅 每日早间市场内参 (${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())})
    
    ---
    
    ## 🏦 1. 大盘回顾与总结
    ...
    
    ## 📰 2. 核心财经要闻
    ...
    
    ## 🔮 3. 今日预测与操作建议
    ...
    
    ## 🌟 4. 今日关注个股/板块
    ...
    
    ---
    *本报告由 TradingAgents AI 专家组自动生成，仅供参考。*
  `.trim();

  const response = await withRetry(async () => {
    return await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });
  }, 3, 3000);

  const text = response.text;
  if (!text) throw new Error("Gemini did not return any text.");
  return text;
}
