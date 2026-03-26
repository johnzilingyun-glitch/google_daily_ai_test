import { GoogleGenAI } from "@google/genai";
import { createAI, withRetry, parseJsonResponse } from "./geminiService";
import { StockAnalysis, AgentMessage, Scenario, AgentDiscussion, GeminiConfig } from "../types";

export async function startAgentDiscussion(
  analysis: StockAnalysis, 
  config?: GeminiConfig, 
  history?: AgentMessage[]
): Promise<AgentDiscussion> {
  const ai = createAI(config);
  const historyContext = history ? `\n\n**PREVIOUS DISCUSSION HISTORY**:\n${JSON.stringify(history)}` : "";
  const prompt = `
    You are a team of 5 elite financial analysts (Technical, Fundamental, Sentiment, Risk, Contrarian).
    Analyze the following stock: ${JSON.stringify(analysis)}
    ${historyContext}
    
    Conduct a deep, multi-perspective discussion.
    
    **CRITICAL REQUIREMENTS (REFACTORING UPDATE)**:
    1. **EVIDENCE-BASED**: Every analyst MUST cite specific data points from the analysis.
    2. **CAUSATION CHECK**: Distinguish between correlation and causation.
    3. **VERIFICATION METRICS**: Define "可跟踪验证指标体系" (Trackable Verification Metrics) for the thesis.
    4. **CAPITAL BEHAVIOR**: Incorporate Northbound flow, institutional changes, and AH premium.
    5. **CYCLE & VOLATILITY**: Address the cyclical nature and volatility of the stock.
    6. **POSITION MANAGEMENT**: Provide a layered entry strategy (分层建仓) and position sizing logic based on risk levels.
    7. **TIME DIMENSION**: Define the expected timeframe for the thesis to play out.
    
    Return JSON only:
    {
      "messages": [
        { "role": "Technical Analyst", "content": "..." },
        { "role": "Fundamental Analyst", "content": "..." },
        { "role": "Sentiment Analyst", "content": "..." },
        { "role": "Risk Manager", "content": "..." },
        { "role": "Contrarian Strategist", "content": "..." },
        { "role": "Chief Strategist", "content": "Final synthesis and conclusion..." }
      ],
      "scenarios": [
        { "case": "Bull", "probability": 30, "targetPrice": "...", "logic": "..." },
        { "case": "Base", "probability": 50, "targetPrice": "...", "logic": "..." },
        { "case": "Bear", "probability": 20, "targetPrice": "...", "logic": "..." }
      ],
      "valuationMatrix": [
        { "case": "Optimistic", "probability": 25, "targetPrice": "...", "logic": "..." },
        { "case": "Neutral", "probability": 50, "targetPrice": "...", "logic": "..." },
        { "case": "Pessimistic", "probability": 25, "targetPrice": "...", "logic": "..." }
      ],
      "sensitivityFactors": [
        { "factor": "Interest Rates", "impact": "High", "logic": "..." }
      ],
      "expectationGap": {
        "marketExpectation": "...",
        "aiExpectation": "...",
        "gapLogic": "..."
      },
      "analystWeights": [
        { "role": "Fundamental", "weight": 0.4, "reason": "..." }
      ],
      "calculations": [
        { "name": "DCF", "value": "...", "formula": "...", "inputs": {} }
      ],
      "controversialPoints": ["..."],
      "tradingPlanHistory": [
        { "version": 1, "timestamp": "...", "changes": "Initial plan", "plan": { "entry": "...", "target": "...", "stop": "..." } }
      ],
      "dataFreshnessStatus": "Fresh",
      "stressTestLogic": "...",
      "catalystList": [
        { "event": "Earnings", "date": "...", "impact": "High" }
      ],
      "backtestResult": {
        "previousRecommendation": "...",
        "actualReturn": "..."
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
        "initialPosition": "...",
        "addPositionLogic": "...",
        "maxPosition": "...",
        "riskLevel": "..."
      },
      "timeDimension": {
        "holdingPeriod": "...",
        "exitStrategy": "...",
        "keyMilestones": ["..."]
      }
    }
  `;

  const response = await withRetry(async () => {
    const result = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt
    });
    return result.text;
  });

  return parseJsonResponse<AgentDiscussion>(response);
}
