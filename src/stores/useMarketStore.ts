import { create } from 'zustand';
import { MarketOverview } from '../types';

interface MarketState {
  marketOverview: MarketOverview | null;
  dailyReport: string | null;
  historyItems: any[];
  optimizationLogs: any[];

  setMarketOverview: (overview: MarketOverview | null) => void;
  setDailyReport: (report: string | null) => void;
  setHistoryItems: (items: any[]) => void;
  setOptimizationLogs: (logs: any[]) => void;
}

export const useMarketStore = create<MarketState>((set) => ({
  marketOverview: null,
  dailyReport: null,
  historyItems: [],
  optimizationLogs: [],

  setMarketOverview: (marketOverview) => set({ marketOverview }),
  setDailyReport: (dailyReport) => set({ dailyReport }),
  setHistoryItems: (historyItems) => set({ historyItems }),
  setOptimizationLogs: (optimizationLogs) => set({ optimizationLogs }),
}));
