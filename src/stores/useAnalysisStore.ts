import { create } from 'zustand';
import { Market, StockAnalysis, AgentMessage, Scenario, SensitivityFactor, ExpectationGap, AnalystWeight, CalculationResult, TradingPlanVersion, AgentDiscussion } from '../types';

interface AnalysisState {
  symbol: string;
  market: Market;
  analysis: StockAnalysis | null;
  chatMessage: string;
  chatHistory: { role: 'user' | 'ai'; content: string }[];
  discussionMessages: AgentMessage[];
  scenarios: Scenario[];
  valuationMatrix: Scenario[];
  sensitivityFactors: SensitivityFactor[];
  expectationGap: ExpectationGap | null;
  analystWeights: AnalystWeight[];
  calculations: CalculationResult[];
  controversialPoints: string[];
  tradingPlanHistory: TradingPlanVersion[];
  dataFreshnessStatus: "Fresh" | "Stale" | "Warning" | null;
  stressTestLogic: string;
  catalystList: any[];
  backtestResult: any;
  verificationMetrics: AgentDiscussion['verificationMetrics'];
  capitalFlow: AgentDiscussion['capitalFlow'] | null;
  positionManagement: AgentDiscussion['positionManagement'] | null;
  timeDimension: AgentDiscussion['timeDimension'] | null;

  setSymbol: (symbol: string) => void;
  setMarket: (market: Market) => void;
  setAnalysis: (analysis: StockAnalysis | null) => void;
  setChatMessage: (message: string) => void;
  setChatHistory: (history: { role: 'user' | 'ai'; content: string }[] | ((prev: { role: 'user' | 'ai'; content: string }[]) => { role: 'user' | 'ai'; content: string }[])) => void;
  setDiscussionMessages: (messages: AgentMessage[] | ((prev: AgentMessage[]) => AgentMessage[])) => void;
  setScenarios: (scenarios: Scenario[]) => void;
  setValuationMatrix: (matrix: Scenario[]) => void;
  setSensitivityFactors: (factors: SensitivityFactor[]) => void;
  setExpectationGap: (gap: ExpectationGap | null) => void;
  setAnalystWeights: (weights: AnalystWeight[]) => void;
  setCalculations: (calculations: CalculationResult[]) => void;
  setControversialPoints: (points: string[]) => void;
  setTradingPlanHistory: (history: TradingPlanVersion[] | ((prev: TradingPlanVersion[]) => TradingPlanVersion[])) => void;
  setDataFreshnessStatus: (status: "Fresh" | "Stale" | "Warning" | null) => void;
  setStressTestLogic: (logic: string) => void;
  setCatalystList: (list: any[]) => void;
  setBacktestResult: (result: any) => void;
  setVerificationMetrics: (metrics: AgentDiscussion['verificationMetrics']) => void;
  setCapitalFlow: (flow: AgentDiscussion['capitalFlow'] | null) => void;
  setPositionManagement: (management: AgentDiscussion['positionManagement'] | null) => void;
  setTimeDimension: (dimension: AgentDiscussion['timeDimension'] | null) => void;
  setDiscussionResults: (discussion: AgentDiscussion) => void;
  resetAnalysis: () => void;
}

export const useAnalysisStore = create<AnalysisState>((set) => ({
  symbol: '',
  market: 'A-Share',
  analysis: null,
  chatMessage: '',
  chatHistory: [],
  discussionMessages: [],
  scenarios: [],
  valuationMatrix: [],
  sensitivityFactors: [],
  expectationGap: null,
  analystWeights: [],
  calculations: [],
  controversialPoints: [],
  tradingPlanHistory: [],
  dataFreshnessStatus: null,
  stressTestLogic: '',
  catalystList: [],
  backtestResult: null,
  verificationMetrics: [],
  capitalFlow: null,
  positionManagement: null,
  timeDimension: null,

  setSymbol: (symbol) => set({ symbol }),
  setMarket: (market) => set({ market }),
  setAnalysis: (analysis) => set({ analysis }),
  setChatMessage: (chatMessage) => set({ chatMessage }),
  setChatHistory: (updater) => set((state) => ({ chatHistory: typeof updater === 'function' ? updater(state.chatHistory) : updater })),
  setDiscussionMessages: (updater) => set((state) => ({ discussionMessages: typeof updater === 'function' ? updater(state.discussionMessages) : updater })),
  setScenarios: (scenarios) => set({ scenarios }),
  setValuationMatrix: (valuationMatrix) => set({ valuationMatrix }),
  setSensitivityFactors: (sensitivityFactors) => set({ sensitivityFactors }),
  setExpectationGap: (expectationGap) => set({ expectationGap }),
  setAnalystWeights: (analystWeights) => set({ analystWeights }),
  setCalculations: (calculations) => set({ calculations }),
  setControversialPoints: (controversialPoints) => set({ controversialPoints }),
  setTradingPlanHistory: (updater) => set((state) => ({ tradingPlanHistory: typeof updater === 'function' ? updater(state.tradingPlanHistory) : updater })),
  setDataFreshnessStatus: (dataFreshnessStatus) => set({ dataFreshnessStatus }),
  setStressTestLogic: (stressTestLogic) => set({ stressTestLogic }),
  setCatalystList: (catalystList) => set({ catalystList }),
  setBacktestResult: (backtestResult) => set({ backtestResult }),
  setVerificationMetrics: (verificationMetrics) => set({ verificationMetrics }),
  setCapitalFlow: (capitalFlow) => set({ capitalFlow }),
  setPositionManagement: (positionManagement) => set({ positionManagement }),
  setTimeDimension: (timeDimension) => set({ timeDimension }),
  setDiscussionResults: (discussion) => set({
    discussionMessages: discussion.messages,
    scenarios: discussion.scenarios || [],
    valuationMatrix: discussion.valuationMatrix || [],
    sensitivityFactors: discussion.sensitivityFactors || [],
    expectationGap: discussion.expectationGap || null,
    analystWeights: discussion.analystWeights || [],
    calculations: discussion.calculations || [],
    controversialPoints: discussion.controversialPoints || [],
    tradingPlanHistory: discussion.tradingPlanHistory || [],
    dataFreshnessStatus: discussion.dataFreshnessStatus || null,
    stressTestLogic: discussion.stressTestLogic || '',
    catalystList: discussion.catalystList || [],
    backtestResult: discussion.backtestResult || null,
    verificationMetrics: discussion.verificationMetrics || [],
    capitalFlow: discussion.capitalFlow || null,
    positionManagement: discussion.positionManagement || null,
    timeDimension: discussion.timeDimension || null,
  }),
  resetAnalysis: () => set({
    analysis: null,
    chatHistory: [],
    discussionMessages: [],
    scenarios: [],
    valuationMatrix: [],
    sensitivityFactors: [],
    expectationGap: null,
    analystWeights: [],
    calculations: [],
    controversialPoints: [],
    tradingPlanHistory: [],
    dataFreshnessStatus: null,
    stressTestLogic: '',
    catalystList: [],
    backtestResult: null,
    verificationMetrics: [],
    capitalFlow: null,
    positionManagement: null,
    timeDimension: null,
  }),
}));
