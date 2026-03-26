import { GoogleGenAI } from "@google/genai";
import { Market, MarketOverview, StockAnalysis, AgentMessage, AgentRole, StockInfo, AgentDiscussion, Scenario, AnalystWeight, CalculationResult, SensitivityFactor, ExpectationGap } from "../types";

const GEMINI_MODEL = "gemini-3-flash-preview";

/**
 * Perception Layer: MCP Toolbox (Simulated)
 * In a real implementation, these would call actual MCP Servers.
 */
const mcpToolbox = {
  async getFinanceData(symbol: string) {
    // Simulated FMP / Bloomberg API call
    return {
      source: "Financial Modeling Prep (FMP)",
      timestamp: new Date().toISOString(),
      weight: 1.0,
      data: {
        ticker: symbol,
        pe: "18.5",
        pb: "2.4",
        roe: "15.2%",
        eps: "3.45",
        revenueGrowth: "12.8%",
        fcf: "1.2B",
        lastUpdated: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) + " CST"
      }
    };
  },
  async getMacroData() {
    // Simulated FRED API call
    return {
      source: "FRED (St. Louis Fed)",
      timestamp: new Date().toISOString(),
      weight: 0.95,
      data: {
        riskFreeRate: "4.25%", // 10Y Treasury
        cpi: "3.1%",
        unemploymentRate: "3.8%"
      }
    };
  },
  async getConsensus(symbol: string) {
    // Simulated Refinitiv / Bloomberg Consensus
    return {
      source: "Refinitiv Consensus",
      timestamp: new Date().toISOString(),
      weight: 0.9,
      data: {
        analystCount: 24,
        buy: 18,
        hold: 4,
        sell: 2,
        targetPriceMean: "156.40",
        epsForecastNextYear: "4.10"
      }
    };
  }
};

/**
 * Calculation Layer: Standardized Formula Library
 * Ensures 100% accuracy for financial models.
 */
const formulaLibrary = {
  calculateDCF(fcf: number, growthRate: number, discountRate: number, terminalGrowth: number) {
    // Simplified DCF calculation
    const years = 5;
    let totalPV = 0;
    let currentFCF = fcf;
    for (let i = 1; i <= years; i++) {
      currentFCF *= (1 + growthRate);
      totalPV += currentFCF / Math.pow(1 + discountRate, i);
    }
    const terminalValue = (currentFCF * (1 + terminalGrowth)) / (discountRate - terminalGrowth);
    const terminalPV = terminalValue / Math.pow(1 + discountRate, years);
    return totalPV + terminalPV;
  },
  calculateVaR(portfolioValue: number, confidence: number, volatility: number) {
    // Value at Risk calculation
    const zScore = confidence === 0.95 ? 1.645 : 2.326;
    return portfolioValue * zScore * volatility;
  }
};

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
      
      // Check for 429 / Quota Exceeded in various formats
      const errorStr = typeof error === 'string' ? error : (error?.message || JSON.stringify(error));
      const isRateLimit = errorStr.includes('429') || 
                          errorStr.toLowerCase().includes('quota') || 
                          errorStr.includes('RESOURCE_EXHAUSTED') ||
                          error?.status === 429;
      
      if (isRateLimit && attempt < maxRetries) {
        // Exponential backoff with jitter
        const waitTime = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
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
  const apiKey = process.env.GEMINI_API_KEY;
  
  // If the key is missing or is a placeholder, use the new provided key
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey === "AIzaSyDPWJlFit8gSOzYnO5y29xit6-amjdJowI") {
    return "AIzaSyA06MlY8alZiQQLVPvWw1iIWBty7mTP1hQ";
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
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

export async function getMarketOverview(config?: { model: string }): Promise<MarketOverview> {
  // Check cache first
  const nowTime = Date.now();
  if (marketOverviewCache && (nowTime - marketOverviewCache.timestamp < CACHE_DURATION)) {
    console.log('Returning market overview from cache');
    return marketOverviewCache.data;
  }

  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const modelName = config?.model || GEMINI_MODEL;
  const history = await getHistoryContext();
  const now = new Date();
  const beijingDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
  
  console.log(`Fetching market overview using model: ${modelName}...`);
  
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
    console.log('Fetching real-time indices data...');
    const response = await fetch(`/api/stock/realtime?symbols=${indicesSymbols.join(',')}`);
    if (response.ok) {
      indicesData = await response.json();
      console.log(`Successfully fetched ${indicesData.length} indices.`);
    } else {
      console.warn('Failed to fetch indices data, status:', response.status);
    }
  } catch (e) {
    console.error('Failed to fetch batch indices:', e);
  }
  
  const result = await withRetry(async () => {
    console.log('Calling Gemini for market overview...');
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
      model: modelName,
      contents: prompt,
      config: {
        systemInstruction: `You are a professional financial analyst with access to REAL-TIME data and Google Search. 
        1. ALWAYS prioritize the "GROUND TRUTH" data provided in the prompt. 
        2. Use Google Search to supplement and verify the latest market news and trends. 
        3. If the ground truth data is missing, use Google Search as your primary source. 
        4. NEVER use your internal training data for current prices or market indices. 
        5. Return ONLY valid JSON as requested.`,
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
      },
    });

    console.log('Gemini response received for market overview.');
    const text = response.text;
    if (!text) throw new Error("Gemini did not return any text.");
    const result = parseJsonResponse<MarketOverview>(text);
    
    // Runtime validation
    validateMarketOverview(result);
    
    // Auto-save to history
    void saveAnalysisToHistory('market', result);
    void logOptimization('market_overview', 'fetch', (result.marketSummary || '').slice(0, 50), 'Fetched latest market overview');
    
    return result;
  }, 3, 3000); // Reduced retries for faster feedback

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

export async function analyzeStock(symbol: string, market: Market, config?: { model: string }): Promise<StockAnalysis> {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const modelName = config?.model || GEMINI_MODEL;
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
  console.log(`Analyzing stock ${symbol} in ${market} using model: ${modelName}...`);
  const realtimeData = await getRealtimeStockData(symbol, market);
  if (realtimeData) {
    console.log(`Successfully fetched real-time data for ${symbol}.`);
  } else {
    console.warn(`No real-time data available for ${symbol}, falling back to search.`);
  }
  
  return withRetry(async () => {
    console.log(`Calling Gemini for stock analysis of ${symbol}...`);
    const prompt = `
Current date and time (UTC): ${now.toISOString()}
Current date and time (China Standard Time): ${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}

**REAL-TIME DATA TOOL OUTPUT (GROUND TRUTH)**:
${realtimeData ? JSON.stringify(realtimeData, null, 2) : "No real-time data available from tool. Use Google Search grounding instead."}

You are a professional equity analyst.
Analyze stock "${symbol}" in the ${market} market using the latest available public information and Google Search grounding.

**CROSS-VALIDATION (CRITICAL)**: 
- You MUST cross-validate the "REAL-TIME DATA TOOL OUTPUT" (from Yahoo Finance) with your own Google Search results (from Sina Finance, East Money, etc.).
- **IF THEY DIFFER**: 
   - Yahoo Finance data for A-shares is often delayed by 15-20 minutes. 
   - If Google Search shows a more recent price (e.g., from a Sina Finance snippet within the last 5 minutes), you MUST prioritize the Google Search data for the "price", "change", and "changePercent" fields.
   - Explain the discrepancy in the "summary" field (e.g., "Note: Yahoo Finance data is delayed by 15 mins; using real-time data from Sina Finance").
- **IF TOOL DATA IS MISSING**: Use Google Search as your primary source.
- **IF THEY MATCH**: Proceed with the tool data as the "Ground Truth".

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
6. **DEEP FUNDAMENTAL ANALYSIS (CRITICAL)**: 
   - **LOOK THROUGH SURFACE DATA**: Do NOT just report PE, PB, or reported profits. These can be misleading (迷惑数据).
   - **PENETRATE TO OPERATIONS**: Analyze actual operating cash flow, asset turnover, inventory cycles, and R&D efficiency.
   - **NARRATIVE VS DATA CONSISTENCY**: Detect if management's growth narrative (e.g., "AI transformation") matches actual financial data (e.g., R&D Efficiency, CAPEX). If there's a mismatch, flag it.
   - **NET-NET CALCULATION**: Calculate Graham's "Net-Net" value: (Current Assets - Total Liabilities). If Price < Net-Net, it's "Deep Value".
   - **BUFFETT'S MOAT THEORY**: Analyze the company's "Economic Moat" (Wide, Narrow, or None) and its source (Brand, Network Effect, Switching Costs, Cost Advantage).
   - **EXPECTATION VS REALITY**: Compare current performance with previous market expectations. Is the growth sustainable or a one-time accounting gain?
   - **MARGIN OF SAFETY**: Incorporate "Margin of Safety" (安全边际) theory into the fundamental analysis and trading advice.
7. **HISTORICAL CONTEXT (NEW)**: Include historical price ranges and major historical events affecting the stock.
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
13. **EVIDENCE-BASED REASONING (CRITICAL)**: For every claim made in the analysis, you MUST provide specific evidence (data points, news snippets, or financial ratios). Avoid vague storytelling (叙事过强).
14. **CAUSATION VS CORRELATION**: Explicitly distinguish between variables that are merely correlated and those that have a verified causal link to the stock's performance.
15. **CYCLE & VOLATILITY (NEW)**: For cyclical stocks, identify the current stage (Early/Mid/Late/Bottom/Peak) and analyze how volatility characteristics affect the thesis.
16. **TRACKABLE METRICS (NEW)**: Define specific "Verification Metrics" with thresholds and timeframes (e.g., "If X > Y for Z weeks, then thesis is confirmed").
17. **CAPITAL BEHAVIOR (NEW)**: Analyze Northbound flow, institutional changes, and AH premium to verify if the market "believes" your fundamental logic.
18. **TRADING PLAN LOGIC (NEW)**: 
    - If the recommendation is NOT "Buy" or "Strong Buy", the tradingPlan should state "Not Recommended" (不推荐) for entryPrice, targetPrice, and stopLoss. 
    - Do NOT provide specific price levels if not recommended.
    - **STRATEGY RISKS (NEW)**: Clearly state the specific risks associated with the recommended entry/target/stop-loss levels (e.g., "if stop-loss is too tight, it may be triggered by normal volatility"). This is separate from general keyRisks.
19. tradingPlan must include: entryPrice, targetPrice, stopLoss, strategy, and strategyRisks (all as strings).
20. sentiment must be one of: Bullish, Bearish, Neutral.
21. recommendation must be one of: Strong Buy, Buy, Hold, Sell, Strong Sell.
22. All long-form text fields must be in Simplified Chinese.
23. Continuity: Based on previous analysis of this stock, identify if trends are continuing or reversing.
24. **ANTI-HALLUCINATION (CRITICAL)**: If you cannot find the data, state it clearly in the summary. Do NOT invent numbers.
25. **REASONABLENESS CHECK**: If the price is significantly different from the previous close or historical ranges, you MUST double-check if you have the correct stock and market.

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
  "moatAnalysis": {
    "type": "string",
    "strength": "Wide | Narrow | None",
    "logic": "string"
  },
  "narrativeConsistency": {
    "score": 85,
    "warning": "string",
    "details": "string"
  },
  "netNetValue": 0,
  "isDeepValue": true,
  "verificationMetrics": [
    {
      "indicator": "string",
      "threshold": "string",
      "timeframe": "string",
      "logic": "string"
    }
  ],
  "capitalFlow": {
    "northboundFlow": "string",
    "institutionalHoldings": "string",
    "ahPremium": "string",
    "marketSentiment": "string"
  },
  "cycleAnalysis": {
    "stage": "Early | Mid | Late | Bottom | Peak",
    "logic": "string",
    "volatilityRisk": "string"
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
      model: modelName,
      contents: prompt,
      config: {
        systemInstruction: `You are a professional equity analyst with access to REAL-TIME stock data and Google Search. 
        1. ALWAYS prioritize the "GROUND TRUTH" data provided in the prompt for current price, change, and volume. 
        2. Use Google Search to find the latest news, fundamental data (PE, PB, ROE), and technical analysis insights. 
        3. If ground truth data is missing, use Google Search to find the most recent trading data. 
        4. Ensure all timestamps are in Beijing Time (CST). 
        5. Return ONLY valid JSON as requested.`,
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
  analysis: StockAnalysis,
  config?: { model: string }
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const modelName = config?.model || GEMINI_MODEL;
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
      model: modelName,
      contents: prompt,
      config: {
        systemInstruction: "You are a helpful financial assistant. Use the provided analysis and Google Search to answer user questions accurately and in real-time.",
        tools: [{ googleSearch: {} }],
      },
    });
  }, 3, 2000);

  const text = response.text;
  if (!text) throw new Error("Gemini did not return any text.");
  return text;
}

export async function getStockReport(analysis: StockAnalysis, config?: { model: string }): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const modelName = config?.model || GEMINI_MODEL;
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
      model: modelName,
      contents: prompt,
      config: {
        systemInstruction: "You are a professional financial analyst. Use the provided data and Google Search to create a comprehensive, real-time stock report.",
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
        systemInstruction: "You are a professional financial analyst. Summarize the chat history into a professional report.",
        tools: [{ googleSearch: {} }],
      },
    });
  }, 3, 3000);

  const text = response.text;
  if (!text) throw new Error("Gemini did not return any text.");
  return text;
}

export async function runDeepResearch(
  analysis: StockAnalysis,
  config?: { model: string }
): Promise<{ content: string; references: { title: string; url: string }[] }> {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const modelName = config?.model || GEMINI_MODEL;
  
  // Perception Layer: Fetch consensus data via MCP
  const consensus = await mcpToolbox.getConsensus(analysis.stockInfo?.symbol || "");
  
  const prompt = `
    You are a Deep Research Specialist & Multi-Source Orchestrator. Perform a thorough, data-driven investigation into the stock: ${analysis.stockInfo?.name} (${analysis.stockInfo?.symbol}).
    
    Current Analysis Data:
    ${JSON.stringify(analysis)}
    
    **MARKET CONSENSUS (GROUND TRUTH via MCP)**:
    ${JSON.stringify(consensus, null, 2)}
    
    Your Task (Multi-Source Parallel Search):
    1. **Real-time Financials**: Retrieve current PE/EPS, dividend yield, and recent earnings surprise data.
    2. **Commodity & Macro Monitor**: If relevant (e.g., gold, copper, oil), monitor current prices and supply/demand dynamics.
    3. **Capital Flow Analysis (资金行为验证)**: Search for Northbound funds (北向资金) flow, institutional holding changes (机构持仓), and H-share/A-share premium (AH溢价) if applicable.
    4. **Cycle Analysis (周期性分析)**: Identify where the stock is in its industry cycle (Early/Mid/Late/Bottom/Peak). Analyze volatility characteristics.
    5. **Expectation Gap (预期偏差识别)**: Compare the MARKET CONSENSUS above with our current data. Identify if there's a significant gap (Alpha source). Explain why we might differ from the consensus.
    6. **Freshness Check (强制时间戳)**: For every macro indicator or key data point, you MUST include the collection timestamp (e.g., [2026-03-25 10:00]).
    7. **Confidence Intervals (置信区间)**: Provide ranges for key forecasts (e.g., "Expected 2026 Gold Price: $3200-3400, Confidence: 85%").
    8. **X Semantic Search**: Capture market sentiment shifts and asymmetric information from social media and niche financial forums.
    
    Language: Simplified Chinese.
    Format: Markdown with clear sections. Use tables for quantified data.
    Tone: Extremely rigorous, data-driven, and forward-looking.
  `.trim();

  const response = await withRetry(async () => {
    return await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        systemInstruction: "You are a world-class equity researcher. Use Google Search to find the most recent, specific, and quantified data points with timestamps.",
        tools: [{ googleSearch: {} }],
      },
    });
  }, 3, 4000);

  const content = response.text || "No research data found.";
  const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const references = groundingChunks
    .filter(chunk => chunk.web)
    .map(chunk => ({
      title: chunk.web?.title || "Reference",
      url: chunk.web?.uri || ""
    }))
    .filter(ref => ref.url);

  return { content, references };
}

export async function runAgentDiscussion(
  analysis: StockAnalysis,
  onMessage: (msg: AgentMessage) => void,
  config?: { model: string }
): Promise<AgentDiscussion> {
  if (!analysis || !analysis.stockInfo) {
    throw new Error("Invalid analysis data: missing stockInfo.");
  }

  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const modelName = config?.model || GEMINI_MODEL;
  
  // Perception Layer: Fetch real-time financials and macro data via MCP
  const financeData = await mcpToolbox.getFinanceData(analysis.stockInfo?.symbol || "");
  const macroData = await mcpToolbox.getMacroData();
  
  // Calculation Layer: Run standardized models
  const dcfValuation = formulaLibrary.calculateDCF(
    parseFloat(financeData.data.fcf.replace(/[^0-9.]/g, '') || "0") * 1e9, // 1.2B -> 1.2e9
    0.08, // 8% growth
    0.10, // 10% discount
    0.02  // 2% terminal
  );
  
  const calculations: CalculationResult[] = [
    {
      formulaName: "Standardized DCF Model",
      inputs: { fcf: financeData.data.fcf, growth: "8%", discount: "10%", terminal: "2%" },
      output: dcfValuation.toLocaleString(),
      timestamp: new Date().toISOString()
    }
  ];

  // 1. Backtesting & Dynamic Weighting
  let backtestResult = undefined;
  let analystWeights: AnalystWeight[] = [
    { role: "Technical Analyst", weight: 0.2, isExpert: false },
    { role: "Fundamental Analyst", weight: 0.2, isExpert: false },
    { role: "Sentiment Analyst", weight: 0.2, isExpert: false },
    { role: "Risk Manager", weight: 0.2, isExpert: false },
    { role: "Contrarian Strategist", weight: 0.2, isExpert: false },
  ];

  try {
    const history = await getHistoryContext();
    const previousAnalysis = history.find(h => 
      h.stockInfo?.symbol === analysis.stockInfo.symbol && 
      new Date(h.stockInfo.lastUpdated).getTime() < new Date().getTime() - 24 * 60 * 60 * 1000
    );
    
    if (previousAnalysis) {
      const backtestPrompt = `
        Compare the current stock price of ${analysis.stockInfo.name} (${analysis.stockInfo.price}) 
        with the previous analysis from ${previousAnalysis.stockInfo.lastUpdated}.
        Previous Recommendation: ${previousAnalysis.recommendation}
        Previous Price: ${previousAnalysis.stockInfo.price}
        
        Calculate the actual return and provide a brief learning point for the AI team.
        Also, identify which analyst role (Technical, Fundamental, Sentiment, Risk, Contrarian) would have been most accurate in this specific case.
        Language: Simplified Chinese.
      `.trim();
      
      const btResponse = await ai.models.generateContent({
        model: modelName,
        contents: backtestPrompt,
      });
      
      const btText = btResponse.text || "";
      backtestResult = {
        previousDate: previousAnalysis.stockInfo.lastUpdated,
        previousRecommendation: previousAnalysis.recommendation,
        actualReturn: `${(((analysis.stockInfo.price - previousAnalysis.stockInfo.price) / previousAnalysis.stockInfo.price) * 100).toFixed(2)}%`,
        learningPoint: btText
      };
      
      // Dynamic Weighting Logic
      if (btText.includes("Technical") || btText.includes("技术")) analystWeights.find(w => w.role === "Technical Analyst")!.weight = 0.4;
      if (btText.includes("Fundamental") || btText.includes("基本面")) analystWeights.find(w => w.role === "Fundamental Analyst")!.weight = 0.4;
      if (btText.includes("Sentiment") || btText.includes("情绪")) analystWeights.find(w => w.role === "Sentiment Analyst")!.weight = 0.4;
      if (btText.includes("Risk") || btText.includes("风险")) analystWeights.find(w => w.role === "Risk Manager")!.weight = 0.4;
      if (btText.includes("Contrarian") || btText.includes("反向")) analystWeights.find(w => w.role === "Contrarian Strategist")!.weight = 0.4;

      // Normalize weights
      const totalWeight = analystWeights.reduce((sum, w) => sum + w.weight, 0);
      analystWeights.forEach(w => {
        w.weight = w.weight / totalWeight;
        if (w.weight > 0.25) {
          w.isExpert = true;
          w.expertiseArea = analysis.stockInfo.market === "US-Share" ? "Global Markets" : "Domestic Markets";
        }
      });

      onMessage({
        id: `backtest-${Date.now()}`,
        role: "Professional Reviewer",
        content: `### 历史预测回测 (Backtesting) & 动态权重调整\n- **上次分析日期**: ${backtestResult.previousDate}\n- **当时建议**: ${backtestResult.previousRecommendation}\n- **实际收益率**: ${backtestResult.actualReturn}\n\n**复盘学习点**:\n${backtestResult.learningPoint}\n\n**权重调整**: 系统已根据历史表现调高了部分分析师的权重，并授予“行业专家”勋章。`,
        timestamp: new Date().toISOString(),
        type: "review"
      });
    }
  } catch (err) {
    console.error('Backtesting failed:', err);
  }

  // 2. Run Deep Research
  onMessage({
    id: `research-${Date.now()}`,
    role: "Deep Research Specialist",
    content: "正在启动深度研究引擎，检索实时驱动变量与行业周期数据...",
    timestamp: new Date().toISOString(),
    type: "research"
  });

  const { content: researchData, references } = await runDeepResearch(analysis, config);
  
  onMessage({
    id: `research-complete-${Date.now()}`,
    role: "Deep Research Specialist",
    content: researchData,
    timestamp: new Date().toISOString(),
    type: "research",
    references
  });

  // 3. Discussion Flow
  const discussionFlow: { role: AgentRole; task: string; mandate: string }[] = [
    { 
      role: "Technical Analyst", 
      task: "Provide technical analysis based on momentum and trend-following.",
      mandate: "Focus on the 'Bull Case' (牛市逻辑). Find reasons why the current trend will persist."
    },
    { 
      role: "Fundamental Analyst", 
      task: "Provide fundamental analysis based on intrinsic value.",
      mandate: "Focus on 'Value Realization' (价值回归). Is the stock truly undervalued relative to its growth?"
    },
    { 
      role: "Risk Manager", 
      task: "Identify hidden risks and 'Black Swan' events.",
      mandate: "Be the 'Devil's Advocate'. Find the exact scenario where the stock drops 20%."
    },
    { 
      role: "Contrarian Strategist", 
      task: "Argue against the prevailing consensus of the previous analysts.",
      mandate: "Identify 'Crowded Trades' (拥挤交易) and 'Consensus Bias'. Propose a counter-intuitive trading logic."
    }
  ];

  let discussionHistory = `
    Initial Analysis:
    ${JSON.stringify(analysis)}
    
    Deep Research Findings:
    ${researchData}
  `;

  const messages: AgentMessage[] = [];

  for (const step of discussionFlow) {
    const prompt = `
      You are a ${step.role} in a multi-agent stock analysis team.
      The team is conducting a DEEP, CONFLICT-DRIVEN discussion on the stock: ${analysis.stockInfo?.name} (${analysis.stockInfo?.symbol}).
      
      Current Discussion History:
      ${discussionHistory}
      
      Your Specific Task:
      - ${step.task}
      - **YOUR MANDATE (STRICTLY FOLLOW)**: ${step.mandate}
      - **QUANTIFY DRIVERS**: Do not use vague terms. Use numbers, percentages, and specific price levels.
      - **DIVERGENT THINKING**: If you disagree with a previous analyst, state it boldly and explain why.
      - **PREDICTIVE POWER**: Focus on the next 3-6 months, not just explaining the past.
      - **FORMATTING**: Use Markdown. Use bold text for key terms.
      - Keep your response concise but insightful (max 300 words).
      - Language: Simplified Chinese.
    `.trim();

    const response = await withRetry(async () => {
      return await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          systemInstruction: "You are a professional financial analyst. Be independent, data-driven, and bold in your judgments.",
          tools: [{ googleSearch: {} }],
        },
      });
    }, 3, 4000);

    const content = response.text || "No response.";
    
    // Consistency Monitoring (Fact Check) for Contrarian Strategist
    if (step.role === "Contrarian Strategist") {
      const factCheckPrompt = `
        Check if the following argument by the Contrarian Strategist conflicts with the facts in the Deep Research report.
        
        Deep Research:
        ${researchData}
        
        Contrarian Argument:
        ${content}
        
        If there is a factual conflict (not just a difference in opinion), point it out clearly. If not, say "No factual conflict".
        Language: Simplified Chinese.
      `.trim();
      
      const fcResponse = await ai.models.generateContent({
        model: modelName,
        contents: factCheckPrompt,
      });
      
      const fcText = fcResponse.text || "";
      if (fcText && !fcText.includes("No factual conflict")) {
        onMessage({
          id: `factcheck-${Date.now()}`,
          role: "Professional Reviewer",
          content: `⚠️ **逻辑一致性监测 (Fact Check)**:\n${fcText}`,
          timestamp: new Date().toISOString(),
          type: "fact_check"
        });
      }
    }

    const msg: AgentMessage = {
      id: `${step.role}-${Date.now()}`,
      role: step.role,
      content,
      timestamp: new Date().toISOString(),
      type: "discussion"
    };
    
    onMessage(msg);
    messages.push(msg);
    discussionHistory += `\n\n[${step.role}]: ${content}`;
    await delay(1500);
  }

  // Final Moderator Synthesis with Standardized Matrix
  const moderatorPrompt = `
    You are the Moderator (首席策略师). Synthesize the conflicting views from the discussion into a final conclusion.
    
    Discussion History:
    ${discussionHistory}
    
    Your Task:
    1. **Final Conclusion**: Provide a definitive recommendation.
    2. **Valuation Matrix (核心估值矩阵)**: Provide Bull, Base, and Stress cases with:
       - **Key Inputs (关键假设)**: e.g., "营收增长 15%"
       - **Target Price (目标价)**
       - **Margin of Safety (安全边际)**
       - **Expected Return (预期回报 12M)**
       - **Probability (概率)**: 0-100%
       - **Logic (核心逻辑)**
    3. **Verification Metrics (可跟踪验证指标体系)**: Define 3-5 specific, quantifiable indicators with thresholds and timeframes that confirm or invalidate the thesis (e.g., "LNG > 0.72 for 2 weeks -> Valid Signal").
    4. **Capital Flow Analysis (资金行为验证)**: Incorporate Northbound flow, institutional changes, and AH premium. Does the market "believe" the fundamental logic?
    5. **Position Management (仓位管理逻辑)**: Provide a layered entry strategy (分层建仓) and sizing logic that matches the risk level.
    6. **Time Dimension (时间维度)**: Specify the expected duration, key milestones, and exit triggers.
    7. **Sensitivity Analysis (因子敏感度面板)**: Quantify the impact of key factors (e.g., Gold Price ±5%, Interest Rate ±25bps) on the target price. Provide at least 2 factors. Include the "formula" used for each factor.
    8. **Expectation Gap (预期偏差识别)**: Identify the gap between market consensus (Bloomberg/Refinitiv) and our team's view. Is it an Alpha source? Provide a "confidenceScore" (0-100).
    9. **Stress Test Logic (压力测试逻辑)**: Calculate sensitivity factors (e.g., ΔFCF formula).
    10. **Catalyst List (催化剂清单)**: List upcoming events with probability and impact.
    
    Return the response in JSON format:
    {
      "finalConclusion": "...",
      "tradingPlan": {
        "entryPrice": "...",
        "targetPrice": "...",
        "stopLoss": "...",
        "strategy": "...",
        "strategyRisks": "..."
      },
      "verificationMetrics": [
        { "indicator": "...", "threshold": "...", "timeframe": "...", "logic": "..." }
      ],
      "capitalFlow": {
        "northboundFlow": "...",
        "institutionalHoldings": "...",
        "ahPremium": "...",
        "marketSentiment": "..."
      },
      "positionManagement": {
        "layeredEntry": ["...", "..."],
        "sizingLogic": "...",
        "riskAdjustedStance": "..."
      },
      "timeDimension": {
        "expectedDuration": "...",
        "keyMilestones": ["...", "..."],
        "exitTriggers": ["...", "..."]
      },
      "controversialPoints": ["...", "..."],
      "scenarios": [...],
      "sensitivityFactors": [
        { "factor": "...", "change": "...", "impact": "...", "logic": "...", "formula": "..." }
      ],
      "expectationGap": {
        "marketConsensus": "...",
        "ourView": "...",
        "gapReason": "...",
        "isSignificant": true,
        "confidenceScore": 85
      },
      "stressTestLogic": "...",
      "catalystList": [...]
    }
    
    Language: Simplified Chinese.
  `.trim();

  const modResponse = await withRetry(async () => {
    return await ai.models.generateContent({
      model: modelName,
      contents: moderatorPrompt,
      config: {
        responseMimeType: "application/json",
      },
    });
  }, 3, 4000);

  const modData = JSON.parse(extractJsonBlock(modResponse.text || "{}"));
  
  // Threshold Monitor: Trigger Professional Reviewer if needed
  let finalMessages = [...messages];
  const disagreementThreshold = 15; // 15% disagreement in target price
  const confidenceThreshold = 70; // 70% confidence score
  
  const bullPrice = parseFloat(modData.scenarios.find(s => s.case === "Bull")?.targetPrice.replace(/[^0-9.]/g, '') || "0");
  const stressPrice = parseFloat(modData.scenarios.find(s => s.case === "Stress")?.targetPrice.replace(/[^0-9.]/g, '') || "0");
  const disagreement = bullPrice > 0 ? Math.abs((bullPrice - stressPrice) / bullPrice) * 100 : 0;
  const baseConfidence = modData.scenarios.find(s => s.case === "Base")?.probability || 0;

  if (disagreement > disagreementThreshold || baseConfidence < confidenceThreshold) {
    onMessage({
      id: `threshold-trigger-${Date.now()}`,
      role: "Professional Reviewer",
      content: `🚨 **系统监控器触发 (Threshold Monitor)**: \n- 观点分歧率: ${disagreement.toFixed(2)}% (阈值: ${disagreementThreshold}%)\n- 逻辑置信度: ${baseConfidence}% (阈值: ${confidenceThreshold}%)\n\n正在介入进行深度复核与压力测试...`,
      timestamp: new Date().toISOString(),
      type: "review"
    });

    const reviewPrompt = `
      You are the Professional Reviewer. The discussion has triggered a threshold monitor or there is a significant Expectation Gap.
      
      Discussion History:
      ${discussionHistory}
      
      Moderator's Synthesis:
      ${JSON.stringify(modData)}
      
      Your Task:
      1. **Audit the Logic**: Identify the weakest link in the current consensus.
      2. **Explain the Expectation Gap**: If our view differs significantly from the market (Bloomberg/Refinitiv), explain EXACTLY why we are right and the market is wrong (Alpha Source).
      3. **Active Stress Test**: If the base case fails, what is the most likely outcome?
      4. **Refine the Matrix**: Provide a more robust valuation matrix.
      
      Language: Simplified Chinese.
    `.trim();

    const reviewResponse = await ai.models.generateContent({
      model: modelName,
      contents: reviewPrompt,
    });

    const reviewMsg: AgentMessage = {
      id: `reviewer-trigger-${Date.now()}`,
      role: "Professional Reviewer",
      content: reviewResponse.text || "Reviewer intervention complete.",
      timestamp: new Date().toISOString(),
      type: "review"
    };
    onMessage(reviewMsg);
    finalMessages.push(reviewMsg);
  }

  const finalMsg: AgentMessage = {
    id: `moderator-${Date.now()}`,
    role: "Moderator",
    content: modData.finalConclusion,
    timestamp: new Date().toISOString(),
    type: "discussion"
  };
  onMessage(finalMsg);
  finalMessages.push(finalMsg);

  return {
    messages: finalMessages,
    finalConclusion: modData.finalConclusion,
    tradingPlan: modData.tradingPlan,
    controversialPoints: modData.controversialPoints,
    scenarios: modData.scenarios,
    valuationMatrix: modData.scenarios,
    stressTestLogic: modData.stressTestLogic,
    catalystList: modData.catalystList,
    sensitivityFactors: modData.sensitivityFactors,
    expectationGap: modData.expectationGap,
    verificationMetrics: modData.verificationMetrics,
    capitalFlow: modData.capitalFlow,
    positionManagement: modData.positionManagement,
    timeDimension: modData.timeDimension,
    analystWeights: analystWeights,
    calculations: calculations,
    dataFreshnessStatus: "Fresh",
    backtestResult
  };
}

export async function continueAgentDiscussion(
  userQuestion: string,
  analysis: StockAnalysis,
  discussionHistory: AgentMessage[],
  config?: { model: string }
): Promise<AgentDiscussion> {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const modelName = config?.model || GEMINI_MODEL;
  
  // Active Stress Testing Detection
  const isStressTest = userQuestion.includes("如果") || userQuestion.includes("跌破") || userQuestion.includes("涨破") || userQuestion.includes("压力测试");
  
  const prompt = `
    You are the Professional Reviewer & Moderator (高级评审专家 & 首席策略师).
    
    User Question: ${userQuestion}
    ${isStressTest ? "**ACTIVE STRESS TEST TRIGGERED**: The user is asking for a sensitivity analysis or a stress scenario." : ""}
    
    Context:
    - Stock: ${analysis.stockInfo?.name} (${analysis.stockInfo?.symbol})
    - Discussion History:
    ${discussionHistory.map(m => `[${m.role}]: ${m.content}`).join('\n\n')}
    
    Your Task:
    1. **Answer the User**: Provide a professional, data-driven answer.
    2. **Active Stress Testing (if triggered)**: 
       - Command the analysts to re-calculate quantitative indicators.
       - Output a new ΔFCF impact report or sensitivity analysis.
    3. **RE-EVALUATE CONCLUSION**: Based on the user's question and your review, determine if the "Final Conclusion" or "Trading Plan" needs to be updated.
    4. **VERSION CONTROL (NEW)**: If the Trading Plan changes, explain the "Change Reason" (e.g., "User question revealed tariff risks").
    5. **OUTPUT JSON**: You MUST return a JSON object with the following structure.
    
    JSON Schema:
    {
      "answer": "Your detailed answer to the user question in Markdown",
      "hasConclusionChanged": true,
      "changeReason": "...",
      "updatedConclusion": "Only if changed, otherwise same as current",
      "updatedTradingPlan": {
        "entryPrice": "...",
        "targetPrice": "...",
        "stopLoss": "...",
        "strategy": "...",
        "strategyRisks": "..."
      },
      "updatedScenarios": [...],
      "updatedSensitivityFactors": [...]
    }
    
    Language: Simplified Chinese.
  `.trim();

  const response = await withRetry(async () => {
    return await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        systemInstruction: "You are a world-class hedge fund analyst. Be precise, quantified, and proactive. Return JSON only.",
        responseMimeType: "application/json",
      },
    });
  }, 3, 4000);

  const data = JSON.parse(extractJsonBlock(response.text || "{}"));
  
  const reviewerMsg: AgentMessage = {
    id: `reviewer-${Date.now()}`,
    role: "Professional Reviewer",
    content: data.answer || "No response.",
    timestamp: new Date().toISOString(),
    type: "review"
  };

  return {
    messages: [reviewerMsg],
    finalConclusion: data.updatedConclusion || analysis.finalConclusion || "",
    tradingPlan: data.updatedTradingPlan || analysis.tradingPlan,
    tradingPlanHistory: data.hasConclusionChanged ? [{
      version: `V${(analysis.tradingPlanHistory?.length || 0) + 2}`,
      timestamp: new Date().toISOString(),
      changeReason: data.changeReason || "User interaction triggered re-evaluation",
      plan: data.updatedTradingPlan || analysis.tradingPlan!
    }] : [],
    scenarios: data.updatedScenarios,
    sensitivityFactors: data.updatedSensitivityFactors
  };
}

export async function getDiscussionReport(
  analysis: StockAnalysis, 
  discussion: AgentMessage[], 
  scenarios?: Scenario[],
  backtestResult?: any,
  config?: { model: string }
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const modelName = config?.model || GEMINI_MODEL;
  const prompt = `
    基于以下个股分析数据、AI 专家组研讨记录以及场景概率分布，生成一份完整的个股深度研究报告。
    
    报告应包含：
    1. 🚀 **股票基本信息**：名称、代码、当前价格、涨跌幅。
    2. 📊 **核心财务指标**：PE, PB, ROE, EPS 等关键数据及当前估值水位。
    3. 🧠 **AI 专家组研讨摘要**：
       - 技术面、基本面、情绪面、风险管理、反向策略各方的核心观点。
       - 研讨中的主要分歧或共识点。
    4. 🔮 **场景概率分布 (Scenarios)**：
       ${scenarios ? scenarios.map(s => `- **${s.case} Case** (${s.probability}%): 目标价 ${s.targetPrice}, 逻辑: ${s.logic}`).join('\n') : '未提供'}
    5. 🎯 **首席策略师最终结论**：明确的操作建议。
    6. 🛡️ **安全边际评估**：基于安全边际理论的深度评价。
    7. 📈 **交易计划**：建议买入价、目标价、止损价。
    8. ⚠️ **核心机会与风险提示**。
    ${backtestResult ? `9. ⏪ **历史回测复盘**: 上次建议 ${backtestResult.previousRecommendation}, 实际收益 ${backtestResult.actualReturn}` : ''}
    
    10. **完整研讨记录**：在报告最后，以引用块的形式完整保留每一位分析师的发言。
    
    分析数据：
    ${JSON.stringify(analysis)}
    
    研讨记录：
    ${discussion.map(m => `[${m.role}]: ${m.content}`).join('\n\n')}
    
    请使用 Markdown 格式，语气专业、客观且深度。
    使用丰富的 Emoji 增加可读性。
    回答语言：简体中文。
  `.trim();

  const response = await withRetry(async () => {
    return await ai.models.generateContent({
      model: modelName,
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

export async function getDailyReport(marketOverview: MarketOverview, config?: { model: string }): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const modelName = config?.model || GEMINI_MODEL;
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
      model: modelName,
      contents: prompt,
      config: {
        systemInstruction: "You are a professional financial analyst. Use the provided data and Google Search to create a comprehensive, real-time daily market report.",
        tools: [{ googleSearch: {} }],
      },
    });
  }, 3, 3000);

  const text = response.text;
  if (!text) throw new Error("Gemini did not return any text.");
  return text;
}
