import { useState, useCallback } from 'react';
import { Market, StockAnalysis, AgentMessage, GeminiConfig, Scenario, Catalyst, SensitivityFactor, ExpectationGap, AnalystWeight, CalculationResult, TradingPlanVersion } from '../types';
import { analyzeStock, runAgentDiscussion, continueAgentDiscussion } from '../services/aiService';

export function useStockAnalysis(geminiConfig: GeminiConfig) {
  const [symbol, setSymbol] = useState('');
  const [market, setMarket] = useState<Market>('A-Share');
  const [analysis, setAnalysis] = useState<StockAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Agent Discussion State
  const [discussionMessages, setDiscussionMessages] = useState<AgentMessage[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [sensitivityFactors, setSensitivityFactors] = useState<SensitivityFactor[]>([]);
  const [expectationGap, setExpectationGap] = useState<ExpectationGap | null>(null);
  const [analystWeights, setAnalystWeights] = useState<AnalystWeight[]>([]);
  const [calculations, setCalculations] = useState<CalculationResult[]>([]);
  const [controversialPoints, setControversialPoints] = useState<string[]>([]);
  const [tradingPlanHistory, setTradingPlanHistory] = useState<TradingPlanVersion[]>([]);
  const [dataFreshnessStatus, setDataFreshnessStatus] = useState<"Fresh" | "Stale" | "Warning" | null>(null);
  const [stressTestLogic, setStressTestLogic] = useState('');
  const [catalystList, setCatalystList] = useState<Catalyst[]>([]);
  const [backtestResult, setBacktestResult] = useState<any>(null);
  const [isDiscussing, setIsDiscussing] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [showDiscussion, setShowDiscussion] = useState(false);

  const handleSearch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!symbol || !symbol.trim()) return;

    setLoading(true);
    setAnalysis(null);
    setAnalysisError(null);
    setDiscussionMessages([]);
    setShowDiscussion(false);

    try {
      const result = await analyzeStock(symbol, market, geminiConfig);
      setAnalysis(result);

      setShowDiscussion(true);
      setIsDiscussing(true);
      setDiscussionMessages([]);
      setScenarios([]);
      setStressTestLogic('');
      setCatalystList([]);
      setBacktestResult(null);

      try {
        const discussion = await runAgentDiscussion(result, (msg) => {
          setDiscussionMessages(prev => [...prev, msg]);
        }, geminiConfig);

        setScenarios(discussion.scenarios || []);
        setSensitivityFactors(discussion.sensitivityFactors || []);
        setExpectationGap(discussion.expectationGap || null);
        setAnalystWeights(discussion.analystWeights || []);
        setCalculations(discussion.calculations || []);
        setControversialPoints(discussion.controversialPoints || []);
        setTradingPlanHistory(discussion.tradingPlanHistory || []);
        setDataFreshnessStatus(discussion.dataFreshnessStatus || null);
        setStressTestLogic(discussion.stressTestLogic || '');
        setCatalystList(discussion.catalystList || []);
        setBacktestResult(discussion.backtestResult || null);

        setAnalysis(prev => prev ? {
          ...prev,
          finalConclusion: discussion.finalConclusion,
          tradingPlan: discussion.tradingPlan || prev.tradingPlan
        } : null);

        void fetch('/api/admin/save-analysis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'stock',
            data: {
              ...result,
              discussion: discussion.messages,
              finalConclusion: discussion.finalConclusion,
              scenarios: discussion.scenarios
            }
          })
        });
      } catch (err) {
        console.error('Agent discussion failed:', err);
      } finally {
        setIsDiscussing(false);
      }
    } catch (err) {
      console.error(err);
      setAnalysis(null);
      let message = '分析股票失败，请稍后重试。';

      if (err instanceof Error) {
        const errStr = err.message;
        if (errStr.includes('429') || errStr.includes('quota') || errStr.includes('RESOURCE_EXHAUSTED')) {
          message = 'API 额度已耗尽 (429)。请检查您的 Google AI Studio 计费设置或稍后再试。';
        } else {
          try {
            const parsed = JSON.parse(errStr);
            if (parsed.error?.message) {
              message = `API 错误: ${parsed.error.message}`;
            }
          } catch {
            message = errStr;
          }
        }
      }
      setAnalysisError(message);
    } finally {
      setLoading(false);
    }
  }, [symbol, market, geminiConfig]);

  const handleDiscussionQuestion = useCallback(async (question: string) => {
    if (!analysis || isReviewing || isDiscussing) return;

    setIsReviewing(true);
    const userMsg: AgentMessage = {
      id: `user-q-${Date.now()}`,
      role: "Moderator",
      content: question,
      timestamp: new Date().toISOString(),
      type: "user_question"
    };

    setDiscussionMessages(prev => [...prev, userMsg]);

    try {
      const discussion = await continueAgentDiscussion(
        question,
        analysis,
        discussionMessages,
        geminiConfig
      );
      setDiscussionMessages(prev => [...prev, ...discussion.messages]);

      if (discussion.scenarios) setScenarios(discussion.scenarios);
      if (discussion.sensitivityFactors) setSensitivityFactors(discussion.sensitivityFactors);
      if (discussion.controversialPoints) setControversialPoints(discussion.controversialPoints);
      if (discussion.tradingPlanHistory) {
        setTradingPlanHistory(prev => [...prev, ...discussion.tradingPlanHistory!]);
      }

      setAnalysis(prev => prev ? {
        ...prev,
        finalConclusion: discussion.finalConclusion || prev.finalConclusion,
        tradingPlan: discussion.tradingPlan || prev.tradingPlan
      } : null);
    } catch (err) {
      console.error('Reviewer failed:', err);
      setDiscussionMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        role: "Professional Reviewer",
        content: `⚠️ 评审专家暂时无法回答：${err instanceof Error ? err.message : '未知错误'}`,
        timestamp: new Date().toISOString(),
        type: "review"
      }]);
    } finally {
      setIsReviewing(false);
    }
  }, [analysis, isReviewing, isDiscussing, discussionMessages, geminiConfig]);

  const resetAnalysis = useCallback(() => {
    setSymbol('');
    setAnalysis(null);
    setAnalysisError(null);
    setDiscussionMessages([]);
    setShowDiscussion(false);
  }, []);

  return {
    symbol, setSymbol,
    market, setMarket,
    analysis, setAnalysis,
    loading,
    analysisError,
    discussionMessages,
    scenarios,
    sensitivityFactors,
    expectationGap,
    analystWeights,
    calculations,
    controversialPoints,
    tradingPlanHistory,
    dataFreshnessStatus,
    stressTestLogic,
    catalystList,
    backtestResult,
    isDiscussing,
    isReviewing,
    showDiscussion,
    handleSearch,
    handleDiscussionQuestion,
    resetAnalysis,
  };
}
