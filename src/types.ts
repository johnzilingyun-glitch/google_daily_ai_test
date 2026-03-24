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
  tradingPlan?: {
    entryPrice: string;
    targetPrice: string;
    stopLoss: string;
    strategy: string;
    strategyRisks: string;
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
  | "Moderator";

export interface AgentMessage {
  id?: string;
  role: AgentRole;
  content: string;
  timestamp: string;
}

export interface AgentDiscussion {
  messages: AgentMessage[];
  finalConclusion: string;
}
