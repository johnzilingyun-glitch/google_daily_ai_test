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
}

export interface MarketOverview {
  indices: IndexInfo[];
  topNews: NewsItem[];
  marketSummary: string;
}

export interface StockAnalysis {
  stockInfo: StockInfo;
  news: NewsItem[];
  summary: string;
  technicalAnalysis: string;
  fundamentalAnalysis: string;
  sentiment: "Bullish" | "Bearish" | "Neutral";
  score: number;
  recommendation: "Strong Buy" | "Buy" | "Hold" | "Sell" | "Strong Sell";
  keyRisks: string[];
  keyOpportunities: string[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
