import { create } from 'zustand';
import { MarketOverview, Market } from '../types';

interface MarketState {
  marketOverviews: Record<Market, MarketOverview | null>;
  marketLastUpdatedTimes: Record<Market, number | null>;
  dailyReport: string | null;
  historyItems: any[];
  optimizationLogs: any[];

  setMarketOverview: (market: Market, overview: MarketOverview | null) => void;
  setMarketLastUpdated: (market: Market, timestamp: number | null) => void;
  setDailyReport: (report: string | null) => void;
  setHistoryItems: (items: any[]) => void;
  setOptimizationLogs: (logs: any[]) => void;
}

export const useMarketStore = create<MarketState>((set) => ({
  marketOverviews: {
    "A-Share": null,
    "HK-Share": null,
    "US-Share": null
  },
  marketLastUpdatedTimes: {
    "A-Share": null,
    "HK-Share": null,
    "US-Share": null
  },
  dailyReport: null,
  historyItems: [],
  optimizationLogs: [],

  setMarketOverview: (market, overview) => 
    set((state) => ({ 
      marketOverviews: { ...state.marketOverviews, [market]: overview } 
    })),
  setMarketLastUpdated: (market, timestamp) => 
    set((state) => ({ 
      marketLastUpdatedTimes: { ...state.marketLastUpdatedTimes, [market]: timestamp } 
    })),
  setDailyReport: (dailyReport) => set({ dailyReport }),
  setHistoryItems: (historyItems) => set({ historyItems }),
  setOptimizationLogs: (optimizationLogs) => set({ optimizationLogs }),
}));
