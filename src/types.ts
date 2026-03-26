export type Market = "A-Share" | "HK-Share" | "US-Share";

export interface StockInfo {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  market: Market;
  currency: string;
  lastUpdated: string;
  previousClose: number;
  dailyHigh?: number;
  dailyLow?: number;
  dataFreshness?: string; // Timestamp from MCP/API
  dataSource?: string; // e.g. "FMP", "Bloomberg"
  sourceWeight?: number; // 0.0 - 1.0
}

export interface NewsItem {
  title: string;
  source: string;
  time: string;
  url: string;
  summary: string;
}

export interface IndexInfo {
  name: string;
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  previousClose: number;
}

export interface SectorAnalysis {
  name: string;
  trend: string;
  conclusion: string;
}

export interface CommodityAnalysis {
  name: string;
  trend: string;
  expectation: string;
}

export interface Recommendation {
  type: "Stock" | "Sector";
  name: string;
  reason: string;
}

export interface MarketOverview {
  indices: IndexInfo[];
  topNews: NewsItem[];
  sectorAnalysis: SectorAnalysis[];
  commodityAnalysis: CommodityAnalysis[];
  recommendations: Recommendation[];
  marketSummary: string;
}

export interface StockFundamentals {
  pe: string;
  pb: string;
  roe: string;
  eps: string;
  revenueGrowth: string;
  valuationPercentile: string;
}

export interface HistoricalData {
  yearHigh: string;
  yearLow: string;
  majorEvents: string[];
}

export interface ValuationAnalysis {
  comparison: string;
  marginOfSafetySummary: string;
}

export interface TradingPlan {
  entryPrice: string;
  targetPrice: string;
  stopLoss: string;
  strategy: string;
  strategyRisks: string;
}

export interface TradingPlanVersion {
  version: string;
  timestamp: string;
  changeReason: string;
  plan: TradingPlan;
}

export interface StockAnalysis {
  stockInfo: StockInfo;
  fundamentals?: StockFundamentals;
  historicalData?: HistoricalData;
  valuationAnalysis?: ValuationAnalysis;
  news: NewsItem[];
  summary: string;
  technicalAnalysis: string;
  fundamentalAnalysis: string;
  sentiment: "Bullish" | "Bearish" | "Neutral";
  score: number;
  recommendation: "Strong Buy" | "Buy" | "Hold" | "Sell" | "Strong Sell";
  keyRisks: string[];
  keyOpportunities: string[];
  discussion?: AgentMessage[];
  finalConclusion?: string;
  tradingPlan?: TradingPlan;
  tradingPlanHistory?: TradingPlanVersion[];
  moatAnalysis?: {
    type: string;
    strength: "Wide" | "Narrow" | "None";
    logic: string;
  };
  narrativeConsistency?: {
    score: number; // 0-100
    warning?: string;
    details: string;
  };
  netNetValue?: number;
  isDeepValue?: boolean;
  verificationMetrics?: {
    indicator: string;
    threshold: string;
    timeframe: string;
    logic: string;
  }[];
  capitalFlow?: {
    northboundFlow: string;
    institutionalHoldings: string;
    ahPremium?: string;
    marketSentiment: string;
  };
  cycleAnalysis?: {
    stage: "Early" | "Mid" | "Late" | "Bottom" | "Peak";
    logic: string;
    volatilityRisk: string;
  };
}

export interface ChatMessage {
  role: "user" | "ai";
  content: string;
}

export type AgentRole = 
  | "Technical Analyst" 
  | "Fundamental Analyst" 
  | "Sentiment Analyst" 
  | "Risk Manager" 
  | "Contrarian Strategist"
  | "Deep Research Specialist"
  | "Professional Reviewer"
  | "Chief Strategist"
  | "Moderator";

export interface AgentMessage {
  id?: string;
  role: AgentRole;
  content: string;
  timestamp: string;
  type?: "discussion" | "research" | "review" | "user_question" | "fact_check";
  references?: { title: string; url: string }[];
}

export interface Scenario {
  case: "Bull" | "Base" | "Stress";
  probability: number; // 0-100
  keyInputs: string;
  targetPrice: string;
  marginOfSafety: string;
  expectedReturn: string; // e.g. "18%"
  logic: string;
}

export interface Catalyst {
  event: string;
  probability: number;
  impact: string; // e.g. "±5% 股价"
}

export interface SensitivityFactor {
  factor: string; // e.g. "金价"
  change: string; // e.g. "±5%"
  impact: string; // e.g. "±3.2% 目标价"
  logic: string;
  formula?: string; // The standardized formula used
}

export interface ExpectationGap {
  marketConsensus: string;
  ourView: string;
  gapReason: string; // Alpha source explanation
  isSignificant: boolean;
  confidenceScore?: number; // 0-100
}

export interface AnalystWeight {
  role: AgentRole;
  weight: number; // 0-1
  isExpert: boolean;
  expertiseArea?: string; // e.g. "Tech", "Commodities"
}

export interface CalculationResult {
  formulaName: string;
  inputs: Record<string, any>;
  output: any;
  timestamp: string;
}

export interface AgentDiscussion {
  messages: AgentMessage[];
  finalConclusion: string;
  tradingPlan?: TradingPlan;
  tradingPlanHistory?: TradingPlanVersion[];
  controversialPoints?: string[];
  scenarios?: Scenario[];
  valuationMatrix?: Scenario[];
  stressTestLogic?: string;
  catalystList?: Catalyst[];
  sensitivityFactors?: SensitivityFactor[];
  expectationGap?: ExpectationGap;
  analystWeights?: AnalystWeight[];
  calculations?: CalculationResult[];
  dataFreshnessStatus?: "Fresh" | "Stale" | "Warning";
  backtestResult?: {
    previousDate: string;
    previousRecommendation: string;
    actualReturn: string;
    learningPoint: string;
  };
  verificationMetrics?: {
    indicator: string;
    threshold: string;
    timeframe: string;
    logic: string;
  }[];
  capitalFlow?: {
    northboundFlow: string;
    institutionalHoldings: string;
    ahPremium?: string;
    marketSentiment: string;
  };
  positionManagement?: {
    layeredEntry: string[];
    sizingLogic: string;
    riskAdjustedStance: string;
  };
  timeDimension?: {
    expectedDuration: string;
    keyMilestones: string[];
    exitTriggers: string[];
  };
}

export interface GeminiConfig {
  model: string;
  apiKey?: string;
}
