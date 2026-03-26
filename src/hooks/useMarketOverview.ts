import { useState, useEffect, useCallback, useRef } from 'react';
import { MarketOverview, GeminiConfig } from '../types';
import { getMarketOverview, getDailyReport } from '../services/aiService';
import { fetchWithTimeout } from '../services/geminiClient';

export function useMarketOverview(geminiConfig: GeminiConfig) {
  const [marketOverview, setMarketOverview] = useState<MarketOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const configRef = useRef(geminiConfig);
  configRef.current = geminiConfig;

  const fetchMarketOverview = useCallback(async () => {
    setOverviewLoading(true);
    setOverviewError(null);
    try {
      const data = await getMarketOverview(configRef.current);
      setMarketOverview(data);
    } catch (err) {
      console.error('Failed to fetch market overview:', err);
      let message = '无法加载市场概览。';

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
      setOverviewError(message);
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMarketOverview();
  }, [fetchMarketOverview]);

  return {
    marketOverview,
    overviewLoading,
    overviewError,
    fetchMarketOverview,
  };
}

export function useDailyReport(
  marketOverview: MarketOverview | null,
  geminiConfig: GeminiConfig
) {
  const [isTriggeringReport, setIsTriggeringReport] = useState(false);

  const handleTriggerDailyReport = useCallback(async () => {
    if (!marketOverview) {
      alert('请先等待市场概况加载完成。');
      return;
    }

    setIsTriggeringReport(true);
    try {
      const report = await getDailyReport(marketOverview, geminiConfig);

      const response = await fetchWithTimeout('/api/feishu/send-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: report }),
      });

      if (response.ok) {
        void fetch('/api/admin/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            field: 'feishu_daily_report',
            oldValue: 'standard_format',
            newValue: 'optimized_newsletter_format',
            description: '成功发送优化后的每日市场内参',
          }),
        });
        alert('每日报告已成功生成并发送至飞书！');
      } else {
        const data = await response.json();
        alert(`报告发送失败: ${data.error || '未知错误'}`);
      }
    } catch (err) {
      console.error('Manual report trigger failed:', err);
      alert(`报告触发失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setIsTriggeringReport(false);
    }
  }, [marketOverview, geminiConfig]);

  return { isTriggeringReport, handleTriggerDailyReport };
}
