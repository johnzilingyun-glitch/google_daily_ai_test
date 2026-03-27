import { Market, MarketOverview, StockAnalysis, AgentMessage, Scenario } from "../types";

export const getMarketOverviewPrompt = (indicesData: any[], history: any[], beijingDate: string, now: Date, market: Market = "A-Share") => `
Current date and time (UTC): ${now.toISOString()}
Current date and time (China Standard Time): ${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}

**REAL-TIME INDICES DATA (GROUND TRUTH)**:
${JSON.stringify(indicesData, null, 2)}

You are a professional ${market} markets analyst.
Use Google Search grounding to gather the latest available public information.
If the current time in China is past 15:00 CST, you MUST prioritize fetching the "Closing Price" (收盘价) for ${market} indices.

Previous analysis context (for reference and continuity):
${JSON.stringify(history.slice(0, 3))}

Return JSON only, with no markdown fences and no explanation outside the JSON object.
**IMPORTANT**: The JSON MUST have "indices" at the root level. Do NOT wrap the entire response in another object like "marketOverview" or "data".

Requirements:
1. **STRICT JSON STRUCTURE (CRITICAL)**: The root object MUST contain the "indices" array.
2. Prioritize today's ${market} market tone in the summary.
3. Include exactly 5 indices for the ${market} market:
   - If A-Share: SSE Composite, Shenzhen Component, ChiNext Index, CSI 300, and Hang Seng Index.
   - If HK-Share: Hang Seng Index, Hang Seng Tech Index, Hang Seng China Enterprises Index, Red Chips Index, and GEM Index.
   - If US-Share: S&P 500, Nasdaq Composite, Dow Jones Industrial Average, Russell 2000, and PHLX Semiconductor Index.
4. For each index provide: name, symbol, price, change, changePercent.
**SEARCH STRATEGY (CRITICAL)**: 
   - You MUST use Google Search to find the *real-time* or *latest* values for these indices. 
   - Search query should be something like: "${market} indices ${beijingDate}", "${market} market overview ${beijingDate} closing price", or "${market} indices 东方财富".
   - **DO NOT** rely on your internal knowledge for the current values. 
   - **VERIFY THE DATE & TIME (STRICT)**: You MUST verify that the data is for TODAY (${beijingDate}). If you only find data from a previous day, you MUST state "Warning: Today's data not yet available, showing data from [Date]" in the summary.
   - **RELIABLE SOURCES (PRIORITY)**: Prioritize data from **Sina Finance (新浪财经)**, **East Money (东方财富)**, **Xueqiu (雪球)**, or **Yahoo Finance**.
**CRITICAL DATA ACCURACY**: 
   - You MUST search for the most recent trading data for these indices. 
   - Cross-reference at least TWO authoritative sources (e.g., Sina Finance, East Money, Xueqiu, Baidu Stock) to verify the current price and change.
   - **MANUAL VERIFICATION**: For each index, find the "Previous Close" (昨收) and "Current Price" (现价). Calculate the change and changePercent manually to ensure accuracy.
   - **SOURCE NAMING**: You MUST explicitly state the source name (e.g., "Source: Sina Finance") AND the direct URL of the financial page you used for the index data at the end of the "summary" field.
   - **BEIJING TIME (CRITICAL)**: For A-shares and HK-shares, all times MUST be in Beijing Time (CST). For US-shares, use EST/EDT but provide the Beijing Time equivalent in the summary. The "lastUpdated" field MUST be in "YYYY-MM-DD HH:mm:ss CST" format.
   - Ensure the data is from TODAY'S trading session if the market is open. Note the source and time (with timezone, e.g. UTC+8) in the summary. Briefly mention the calculation used for indices (e.g., "Price 3000 - Prev Close 3010 = -10 (-0.33%)").
   - **DATA INTEGRITY CHECK**: If the "change" or "changePercent" is exactly 0, verify if the stock was suspended or if it's a non-trading day. Check the "Turnover" (成交额) to confirm trading activity.
4. **SECTOR ANALYSIS (NEW)**: Analyze current hot sectors (板块) in the ${market} market and provide a conclusion for each.
5. **COMMODITY ANALYSIS (NEW)**: Analyze major commodity trends (e.g., Gold, Oil, Copper) and provide expected analysis.
6. **RECOMMENDATIONS**: Provide recommended stocks or sectors in the ${market} market based on the above analysis.
7. Include exactly 5 major financial news items from the latest market day for the ${market} market.
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
10. **LANGUAGE (MANDATORY)**: All output MUST be in Simplified Chinese (简体中文).

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

export const getAnalyzeStockPrompt = (symbol: string, market: Market, realtimeData: any, history: any[], beijingDate: string, beijingShortDate: string, now: Date) => `
Current date and time (UTC): ${now.toISOString()}
Current date and time (China Standard Time): ${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}

**REAL-TIME DATA TOOL OUTPUT (ABSOLUTE GROUND TRUTH)**:
${realtimeData ? JSON.stringify(realtimeData, null, 2) : "No real-time data available from tool. Use Google Search grounding instead."}

You are a professional equity analyst.
Analyze stock "${symbol}" in the ${market} market using the latest available public information and Google Search grounding.
All output MUST be in Simplified Chinese (简体中文).

**DATA SOURCE HIERARCHY (CRITICAL)**: 
1. If the "REAL-TIME DATA TOOL OUTPUT" is provided above, you **MUST MUST MUST** use its exact values for ALL matching fields in your JSON output. This includes: "price", "change", "changePercent", "previousClose", "lastUpdated", "dailyHigh" (use dayHigh), "dailyLow" (use dayLow), "pe" (use pe), and currency.
2. **DO NOT** override ANY of the tool-provided numbers with data found in Google Search. The tool data is the absolute mathematical truth.
3. Use Google Search grounding **ONLY** for:
   - Filling in missing fundamental data not provided by the tool (e.g., PB, ROE, EPS, Revenue Growth).
   - Gathering qualitative context: company news, sector trends, management narratives, and analyst opinions.
4. If, and ONLY if, the "REAL-TIME DATA TOOL OUTPUT" says "No real-time data available", then you must use Google Search to find the latest valid price and fundamental data.

If the current time in China is past 15:00 CST (for A-shares) or 16:00 HKT (for HK-shares), the market is closed and you are summarizing the closing action.

Previous analysis context (for reference and continuity):
${JSON.stringify(history.filter((h: any) => h.stockInfo?.symbol === symbol).slice(0, 3))}

Return JSON only, with no markdown fences and no explanation outside the JSON object.
**IMPORTANT**: The JSON MUST have "stockInfo" at the root level. Do NOT wrap the entire response in another object like "analysis" or "data".

Requirements:
1. **STRICT MARKET ADHERENCE (CRITICAL)**: 
   - You MUST identify the company that matches this symbol SPECIFICALLY in the ${market} market. 
   - **NAME-TO-CODE RESOLUTION**: If "${symbol}" is a company name (e.g., "贵州茅台"), you MUST first find its official stock code (e.g., 600519.SH) before searching for price data. Ensure the suffix (.SH, .SZ, .HK) matches the ${market}.
   - **A-SHARE PINYIN SUPPORT**: For the A-Share market, the search term "${symbol}" might be a 6-digit code (e.g., 600989) OR a pinyin abbreviation (e.g., "GZMT" for 贵州茅台). You MUST resolve these abbreviations to the correct A-share stock.
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

export const getChatMessagePrompt = (userMessage: string, analysis: StockAnalysis) => `
You are a professional equity analyst answering a follow-up question from a user.

Existing analysis JSON:
${JSON.stringify(analysis)}

User question:
${userMessage}

Answer in Simplified Chinese.
Be concise, balanced, and practical.
If the question goes beyond the known analysis, say so clearly instead of inventing facts.
`.trim();

export const getStockReportPrompt = (analysis: StockAnalysis) => `
    基于以下个股分析数据，生成一份简洁、专业的个股研究简报。
    报告应包含：
    1. 股票基本信息（名称、代码、当前价格、涨跌幅）。
    2. 核心观点总结（1-2句）。
    3. 技术面与基本面核心要点。
    4. AI 投资建议与风险提示。
    
    分析数据：
    ${JSON.stringify(analysis)}
    
    请使用 Markdown 格式，语气专业且客观。
`.trim();

export const getDiscussionReportPrompt = (analysis: StockAnalysis, discussion: AgentMessage[], scenarios?: Scenario[], backtestResult?: any) => `
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

export const getDailyReportPrompt = (marketOverview: MarketOverview, now: Date, beijingDate: string) => `
    Current date and time: ${now.toISOString()}
    
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
    # 📅 每日早间市场内参 (${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(now)})
    
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
