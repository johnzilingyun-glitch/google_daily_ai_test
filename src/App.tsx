import React, { useState, useEffect, useCallback } from 'react';
import { 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle, 
  Loader2,
  ArrowLeft,
  BarChart3,
  Bell,
  Globe,
  Info,
  MessageSquare,
  Newspaper,
  PieChart,
  Search,
  Send,
  Settings,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Zap,
  Share2,
  X,
  LayoutGrid,
  Coins,
  Star,
  History,
  ShieldCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Market, MarketOverview, StockAnalysis, AgentMessage } from './types';
import { analyzeStock, getMarketOverview, sendChatMessage, getDailyReport, getStockReport, getChatReport, runAgentDiscussion, getDiscussionReport } from './services/aiService';
import { DiscussionPanel } from './components/DiscussionPanel';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function ErrorNotice({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-rose-300">
      <AlertCircle size={18} className="mt-0.5 shrink-0" />
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-1 text-sm text-rose-200/90">{message}</p>
      </div>
    </div>
  );
}

const chatPrompts = [
  '现在适合追高还是等回调？',
  '这只股票未来三个月最大的风险是什么？',
  '请给我一个更稳健的交易计划。',
];

export default function App() {
  console.log('App is rendering');

  // Market Analysis State
  const [symbol, setSymbol] = useState('');
  const [market, setMarket] = useState<Market>("A-Share");
  const [analysis, setAnalysis] = useState<StockAnalysis | null>(null);
  const [marketOverview, setMarketOverview] = useState<MarketOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [dailyReport, setDailyReport] = useState<string | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [isSendingReport, setIsSendingReport] = useState(false);
  const [reportStatus, setReportStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatMessage, setChatMessage] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'ai'; content: string }[]>([]);
  const [isTriggeringReport, setIsTriggeringReport] = useState(false);

  // History and Logs State
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [optimizationLogs, setOptimizationLogs] = useState<any[]>([]);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState<{ type: 'log' | 'history', data: any } | null>(null);

  // Agent Discussion State
  const [discussionMessages, setDiscussionMessages] = useState<AgentMessage[]>([]);
  const [isDiscussing, setIsDiscussing] = useState(false);
  const [showDiscussion, setShowDiscussion] = useState(false);

  // Manual Daily Report Trigger
  const handleTriggerDailyReport = async () => {
    if (!marketOverview) {
      alert('请先等待市场概况加载完成。');
      return;
    }

    setIsTriggeringReport(true);
    try {
      // Generate report in frontend
      const report = await getDailyReport(marketOverview);
      
      // Send to Feishu via backend
      const response = await fetch('/api/feishu/send-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: report })
      });

      if (response.ok) {
        // Log optimized daily report sending
        void fetch('/api/admin/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            field: 'feishu_daily_report', 
            oldValue: 'standard_format', 
            newValue: 'optimized_newsletter_format', 
            description: '成功发送优化后的每日市场内参' 
          })
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
  };

  // Fetch Market Overview
  useEffect(() => {
    async function fetchOverview() {
      try {
        const data = await getMarketOverview();
        setMarketOverview(data);
        setOverviewError(null);
      } catch (err) {
        console.error('Failed to fetch market overview:', err);
        const message = err instanceof Error ? err.message : 'Failed to load market overview.';
        setOverviewError(message);
      } finally {
        setOverviewLoading(false);
      }
    }

    void fetchOverview();
    void fetchAdminData();
    
    // Log the UI and Report optimization
    const logOptimization = async () => {
      try {
        await fetch('/api/admin/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            field: 'system_optimization', 
            oldValue: 'standard_ui_reports', 
            newValue: 'optimized_ui_and_feishu_reports', 
            description: '优化了个股研讨 UI 显示和飞书报告的 Markdown 格式，增强了用户友好度和可读性。' 
          })
        });
      } catch (err) {
        console.error('Failed to log optimization:', err);
      }
    };
    void logOptimization();
  }, []);

  const fetchAdminData = async () => {
    try {
      const [historyRes, logsRes] = await Promise.all([
        fetch('/api/admin/history-context'),
        fetch('/api/admin/optimization-logs')
      ]);
      if (historyRes.ok) setHistoryItems(await historyRes.json());
      if (logsRes.ok) setOptimizationLogs(await logsRes.json());
    } catch (err) {
      console.error('Failed to fetch admin data:', err);
    }
  };

  const handleSendDailyReport = async () => {
    if (!marketOverview) return;
    
    setIsGeneratingReport(true);
    setReportStatus('idle');
    try {
      const report = await getDailyReport(marketOverview);
      setDailyReport(report);
      setIsGeneratingReport(false);
      
      setIsSendingReport(true);
      const response = await fetch('/api/feishu/send-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: report }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to send report');
      }
      
      setReportStatus('success');
      setTimeout(() => setReportStatus('idle'), 3000);
    } catch (error) {
      console.error('Report Error:', error);
      setReportStatus('error');
      setIsGeneratingReport(false);
    } finally {
      setIsSendingReport(false);
    }
  };

  const handleSendStockReport = async () => {
    if (!analysis) return;
    
    setIsGeneratingReport(true);
    setReportStatus('idle');
    try {
      const report = await getStockReport(analysis);
      setIsGeneratingReport(false);
      
      setIsSendingReport(true);
      const response = await fetch('/api/feishu/send-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          content: report,
          type: 'stock',
          data: analysis
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to send report');
      }
      
      setReportStatus('success');
      setTimeout(() => setReportStatus('idle'), 3000);
    } catch (error) {
      console.error('Report Error:', error);
      setReportStatus('error');
      setIsGeneratingReport(false);
    } finally {
      setIsSendingReport(false);
    }
  };

  const handleSendChatReport = async () => {
    if (!analysis || !chatHistory || chatHistory.length === 0) return;
    
    setIsGeneratingReport(true);
    setReportStatus('idle');
    try {
      const report = await getChatReport(analysis.stockInfo?.name || 'Unknown', chatHistory);
      setIsGeneratingReport(false);
      
      setIsSendingReport(true);
      const response = await fetch('/api/feishu/send-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          content: report,
          type: 'chat',
          data: { stock: analysis.stockInfo?.name || 'Unknown', history: chatHistory }
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to send report');
      }
      
      // Log optimized chat report sending
      void fetch('/api/admin/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          field: 'feishu_chat_report', 
          oldValue: 'standard_format', 
          newValue: 'optimized_markdown', 
          description: `成功发送优化后的追问研讨报告: ${analysis.stockInfo?.name}` 
        })
      });
      
      setReportStatus('success');
      setTimeout(() => setReportStatus('idle'), 3000);
    } catch (error) {
      console.error('Chat Report Error:', error);
      setReportStatus('error');
      setIsGeneratingReport(false);
    } finally {
      setIsSendingReport(false);
    }
  };

  const handleSendDiscussionReport = async () => {
    if (!analysis || discussionMessages.length === 0) return;
    
    setIsGeneratingReport(true);
    setIsSendingReport(true);
    setReportStatus('idle');
    
    try {
      const report = await getDiscussionReport(analysis, discussionMessages);
      
      const response = await fetch('/api/feishu/send-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          content: report,
          type: 'discussion',
          data: { stock: analysis.stockInfo?.name || 'Unknown', discussionCount: discussionMessages.length }
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to send report');
      }
      
      // Log optimized discussion report sending
      void fetch('/api/admin/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          field: 'feishu_discussion_report', 
          oldValue: 'standard_format', 
          newValue: 'optimized_markdown', 
          description: `成功发送优化后的个股研讨报告: ${analysis.stockInfo?.name}` 
        })
      });
      
      setReportStatus('success');
      setTimeout(() => setReportStatus('idle'), 3000);
    } catch (error) {
      console.error('Discussion Report Error:', error);
      setReportStatus('error');
    } finally {
      setIsGeneratingReport(false);
      setIsSendingReport(false);
    }
  };

  const handleSendHistoryToFeishu = async (item: any) => {
    setIsSendingReport(true);
    setReportStatus('idle');
    try {
      let report = '';
      if (item.stockInfo) {
        report = await getStockReport(item);
      } else {
        report = await getDailyReport(item);
      }

      const response = await fetch('/api/feishu/send-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          content: report,
          type: 'history_backup',
          data: item
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to send report');
      }
      
      setReportStatus('success');
      setTimeout(() => setReportStatus('idle'), 3000);
    } catch (error) {
      console.error('History Report Error:', error);
      setReportStatus('error');
    } finally {
      setIsSendingReport(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!symbol) return;

    setLoading(true);
    setAnalysisError(null);
    setChatError(null);
    setChatHistory([]);

    try {
      const result = await analyzeStock(symbol, market);
      setAnalysis(result);

      // Trigger Agent Discussion
      setShowDiscussion(true);
      setIsDiscussing(true);
      setDiscussionMessages([]);
      
      let finalMessages: AgentMessage[] = [];
      try {
        await runAgentDiscussion(result, (msg) => {
          setDiscussionMessages(prev => {
            const next = [...prev, msg];
            finalMessages = next;
            return next;
          });
        });
      } catch (err) {
        console.error('Agent discussion failed:', err);
      } finally {
        setIsDiscussing(false);
      }

      // Save to history with discussion
      void fetch('/api/admin/save-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          type: 'stock', 
          data: { 
            ...result, 
            discussion: finalMessages,
            finalConclusion: finalMessages.find(m => m.role === 'Moderator')?.content 
          } 
        })
      });
    } catch (err) {
      console.error(err);
      setAnalysis(null);
      const message = err instanceof Error ? err.message : '分析股票失败，请稍后重试。';
      setAnalysisError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleChat = async (messageOverride?: string) => {
    if (!analysis) return;

    const userMsg = (messageOverride ?? chatMessage).trim();
    if (!userMsg) return;

    setChatMessage('');
    setChatError(null);
    setChatHistory((prev) => [...prev, { role: 'user', content: userMsg }]);
    setIsChatting(true);

    try {
      const reply = await sendChatMessage(userMsg, analysis);
      setChatHistory((prev) => [...prev, { role: 'ai', content: reply || '抱歉，我暂时无法回答这个问题。' }]);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : '对话出错，请稍后重试。';
      setChatError(message);
    } finally {
      setIsChatting(false);
    }
  };

  const resetToHome = () => {
    setAnalysis(null);
    setSymbol('');
    setChatMessage('');
    setChatHistory([]);
    setAnalysisError(null);
    setChatError(null);
    setDiscussionMessages([]);
    setShowDiscussion(false);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 font-sans selection:bg-emerald-500/30">
      {/* Background Gradients */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] h-[40%] w-[40%] rounded-full bg-emerald-500/5 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] h-[40%] w-[40%] rounded-full bg-blue-500/5 blur-[120px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-8 md:px-8">
        {/* Header Section */}
        <header className="mb-12 flex flex-col gap-8 md:flex-row md:items-center md:justify-between glass-panel p-6 rounded-3xl">
          <div className="cursor-pointer" onClick={resetToHome}>
            <h1 className="bg-gradient-to-r from-white to-zinc-500 bg-clip-text text-4xl font-black tracking-tighter text-transparent">
              每日股票智能分析
            </h1>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-500">
              LLM 驱动的市场情报系统
            </p>
          </div>

            <div className="flex flex-col gap-4 sm:flex-row items-center">
              {/* Daily Report Trigger */}
              <button
                onClick={handleTriggerDailyReport}
                disabled={isTriggeringReport}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-900/20 border border-emerald-500/20 rounded-xl hover:bg-emerald-900/40 transition-all text-sm font-medium text-emerald-400 disabled:opacity-50"
              >
                {isTriggeringReport ? <Loader2 size={18} className="animate-spin" /> : <Bell size={18} />}
                触发每日报告
              </button>

              <button
                onClick={() => {
                  setShowAdminPanel(!showAdminPanel);
                  if (!showAdminPanel) fetchAdminData();
                }}
                className="flex items-center gap-2 px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl hover:bg-zinc-700 transition-all text-sm font-medium text-zinc-300"
              >
                <Settings size={18} />
                系统日志
              </button>

              {/* Search Form */}
              <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row w-full sm:w-auto">
              <div className="relative group">
                <select
                  value={market}
                  onChange={(e) => setMarket(e.target.value as Market)}
                  className="h-10 cursor-pointer appearance-none rounded-xl border border-zinc-800 bg-zinc-900 px-4 pr-10 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                >
                  <option value="A-Share">A股</option>
                  <option value="HK-Share">港股</option>
                  <option value="US-Share">美股</option>
                </select>
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500">
                  <TrendingUp size={14} />
                </div>
              </div>

              <div className="relative flex-1 sm:w-48">
                <input
                  type="text"
                  placeholder="代码 (如 600519)"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  className="h-10 w-full rounded-xl border border-zinc-800 bg-zinc-900 pl-10 pr-4 text-sm transition-all placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 font-medium text-white shadow-lg shadow-emerald-900/20 transition-all hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600"
              >
                {loading ? <Loader2 className="animate-spin" size={16} /> : '分析'}
              </button>
            </form>
          </div>
        </header>

        <AnimatePresence mode="wait">
          {analysisError && (
            <motion.div initial={{ opacity: 1, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="mb-8">
              <ErrorNotice title="个股 analysis 加载失败" message={analysisError} />
            </motion.div>
          )}

          {analysis ? (
            <motion.main
              key={analysis.stockInfo?.symbol}
              initial={{ opacity: 1, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="space-y-8"
            >
              <div className="flex items-center justify-between">
                <button
                  onClick={resetToHome}
                  className="flex items-center gap-2 text-sm font-medium text-zinc-500 transition-colors hover:text-white"
                >
                  <ArrowLeft size={16} />
                  返回首页
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSendStockReport}
                    disabled={isGeneratingReport || isSendingReport}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
                      reportStatus === 'success' 
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/50"
                        : reportStatus === 'error'
                        ? "bg-rose-500/20 text-rose-400 border border-rose-500/50"
                        : "bg-zinc-900 border border-white/10 hover:bg-zinc-800 text-zinc-300"
                    )}
                  >
                    {isGeneratingReport ? (
                      <>
                        <Loader2 className="animate-spin" size={16} />
                        生成报告中...
                      </>
                    ) : isSendingReport ? (
                      <>
                        <Loader2 className="animate-spin" size={16} />
                        发送至飞书...
                      </>
                    ) : reportStatus === 'success' ? (
                      <>
                        <CheckCircle2 size={16} />
                        已发送
                      </>
                    ) : (
                      <>
                        <Share2 size={16} />
                        发送个股简报
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Agent Discussion Section */}
              {showDiscussion && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2">
                    <DiscussionPanel 
                      messages={discussionMessages} 
                      isDiscussing={isDiscussing} 
                    />
                  </div>
                  <div className="space-y-6">
                    <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800 h-full">
                      <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-500 mb-6 flex items-center gap-2">
                        <Zap size={16} className="text-emerald-500" />
                        研讨会核心结论
                      </h3>
                      {isDiscussing && discussionMessages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-4 text-zinc-500 py-12">
                          <div className="relative">
                            <Loader2 size={32} className="animate-spin text-emerald-500" />
                            <div className="absolute inset-0 blur-xl bg-emerald-500/20 animate-pulse" />
                          </div>
                          <p className="text-sm font-medium tracking-wide">专家组正在进入会议室...</p>
                        </div>
                      ) : (
                        <div className="space-y-6">
                          {discussionMessages.filter(m => m.role === "Moderator").map((m, i) => (
                            <div key={i} className="relative">
                              <div className="absolute -left-2 top-0 bottom-0 w-1 bg-emerald-500/50 rounded-full" />
                              <p className="text-base leading-relaxed text-emerald-50 italic font-medium pl-4">
                                {m.content}
                              </p>
                            </div>
                          ))}
                          {discussionMessages.length > 0 && isDiscussing && (
                            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800/30 border border-zinc-700/50">
                              <div className="flex gap-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:-0.3s]" />
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:-0.15s]" />
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" />
                              </div>
                              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">专家们正在激烈讨论中</p>
                            </div>
                          )}
                          {discussionMessages.length > 0 && !isDiscussing && discussionMessages.every(m => m.role !== "Moderator") && (
                            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800/30 border border-zinc-700/50">
                              <Loader2 size={12} className="animate-spin text-amber-500" />
                              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">首席策略师正在整理最终意见</p>
                            </div>
                          )}
                        </div>
                      )}

                      {discussionMessages.length > 0 && !isDiscussing && (
                        <div className="pt-4 border-t border-zinc-800 mt-4">
                          <button
                            onClick={handleSendDiscussionReport}
                            disabled={isGeneratingReport || isSendingReport}
                            className={cn(
                              "w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all",
                              reportStatus === 'success' 
                                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/50"
                                : reportStatus === 'error'
                                ? "bg-rose-500/20 text-rose-400 border border-rose-500/50"
                                : "bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-zinc-300"
                            )}
                          >
                            {isGeneratingReport ? (
                              <>
                                <Loader2 className="animate-spin" size={14} />
                                生成研讨总结...
                              </>
                            ) : isSendingReport ? (
                              <>
                                <Loader2 className="animate-spin" size={14} />
                                发送至飞书...
                              </>
                            ) : reportStatus === 'success' ? (
                              <>
                                <CheckCircle2 size={14} />
                                已发送
                              </>
                            ) : (
                              <>
                                <Share2 size={14} />
                                发送研讨总结至飞书
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
                <div className="space-y-8 lg:col-span-2">
                <div className="glass-panel rounded-[2.5rem] p-8 md:p-12">
                  <div className="mb-12 flex flex-wrap items-end justify-between gap-8">
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <span className="rounded-lg bg-zinc-800/50 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400 border border-zinc-700/50">
                          {analysis.stockInfo?.market}
                        </span>
                        <h2 className="text-4xl font-black tracking-tighter text-gradient">{analysis.stockInfo?.name}</h2>
                        <span className="font-mono text-xl font-bold text-zinc-600 tracking-tighter">{analysis.stockInfo?.symbol}</span>
                      </div>
                      <div className="flex items-baseline gap-6">
                        <span className="text-7xl font-black tracking-tighter text-zinc-100">
                          {analysis.stockInfo?.price?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          <span className="ml-3 text-2xl font-bold uppercase text-zinc-600">{analysis.stockInfo?.currency}</span>
                        </span>
                        <div className={cn('flex items-center gap-2 text-2xl font-black tracking-tight px-4 py-1 rounded-2xl border', (analysis.stockInfo?.change ?? 0) >= 0 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-rose-400 bg-rose-500/10 border-rose-500/20')}>
                          {(analysis.stockInfo?.change ?? 0) >= 0 ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
                          <span>{(analysis.stockInfo?.change ?? 0) >= 0 ? '+' : ''}{analysis.stockInfo?.change}</span>
                          <span className="text-lg opacity-80">({analysis.stockInfo?.changePercent}%)</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right space-y-1">
                      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-600">最后更新</p>
                      <p className="text-sm font-bold text-zinc-400">{analysis.stockInfo?.lastUpdated}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-6 border-t border-zinc-800/50 pt-8 md:grid-cols-2">
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-zinc-400">
                        <BarChart3 size={16} className="text-emerald-500" />
                        技术面分析
                      </div>
                      <p className="text-sm leading-relaxed text-zinc-400">{analysis.technicalAnalysis}</p>
                    </div>
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-zinc-400">
                        <PieChart size={16} className="text-blue-500" />
                        基本面分析 (结合安全边际)
                      </div>
                      <p className="text-sm leading-relaxed text-zinc-400">{analysis.fundamentalAnalysis}</p>
                    </div>
                  </div>

                  {analysis.fundamentals && (
                    <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-6 border-t border-zinc-800/50 pt-8">
                      <div className="p-3 rounded-2xl bg-zinc-800/30 border border-zinc-700/30">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">市盈率 PE</p>
                        <p className="text-sm font-bold text-zinc-200">{analysis.fundamentals.pe}</p>
                      </div>
                      <div className="p-3 rounded-2xl bg-zinc-800/30 border border-zinc-700/30">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">市净率 PB</p>
                        <p className="text-sm font-bold text-zinc-200">{analysis.fundamentals.pb}</p>
                      </div>
                      <div className="p-3 rounded-2xl bg-zinc-800/30 border border-zinc-700/30">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">净资产收益率 ROE</p>
                        <p className="text-sm font-bold text-zinc-200">{analysis.fundamentals.roe}</p>
                      </div>
                      <div className="p-3 rounded-2xl bg-zinc-800/30 border border-zinc-700/30">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">每股收益 EPS</p>
                        <p className="text-sm font-bold text-zinc-200">{analysis.fundamentals.eps}</p>
                      </div>
                      <div className="p-3 rounded-2xl bg-zinc-800/30 border border-zinc-700/30">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">营收增长</p>
                        <p className="text-sm font-bold text-zinc-200">{analysis.fundamentals.revenueGrowth}</p>
                      </div>
                      <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-500/60 mb-1">估值水位</p>
                        <p className="text-sm font-bold text-emerald-400">{analysis.fundamentals.valuationPercentile}</p>
                      </div>
                    </div>
                  )}

                  {analysis.historicalData && (
                    <div className="mt-6 p-4 rounded-2xl bg-zinc-800/20 border border-zinc-700/20">
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-3 flex items-center gap-2">
                        <History size={12} />
                        历史数据与重大事件
                      </h4>
                      <div className="flex gap-8 mb-4">
                        <div>
                          <p className="text-[10px] text-zinc-600 uppercase mb-1">52周最高</p>
                          <p className="text-sm font-mono text-zinc-400">{analysis.historicalData.yearHigh}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-zinc-600 uppercase mb-1">52周最低</p>
                          <p className="text-sm font-mono text-zinc-400">{analysis.historicalData.yearLow}</p>
                        </div>
                      </div>
                      <ul className="space-y-2">
                        {analysis.historicalData.majorEvents.map((event, i) => (
                          <li key={i} className="text-xs text-zinc-500 flex items-start gap-2">
                            <span className="mt-1.5 w-1 h-1 rounded-full bg-zinc-700 shrink-0" />
                            {event}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {analysis.valuationAnalysis && (
                    <div className="mt-6 p-6 rounded-2xl bg-emerald-500/5 border border-emerald-500/10">
                      <h4 className="text-sm font-bold text-emerald-400 mb-4 flex items-center gap-2">
                        <ShieldCheck size={18} />
                        市场估值分析 (安全边际评估)
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-2">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">历史均值对比</p>
                          <p className="text-sm text-zinc-300 leading-relaxed">{analysis.valuationAnalysis.comparison}</p>
                        </div>
                        <div className="space-y-2">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">安全边际总结</p>
                          <p className="text-sm text-zinc-300 leading-relaxed font-medium">{analysis.valuationAnalysis.marginOfSafetySummary}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                  <div className="space-y-4 rounded-[2rem] glass-panel p-8">
                    <h3 className="flex items-center gap-2 text-lg font-bold text-zinc-100">
                      <Info size={18} className="text-emerald-500" />
                      核心摘要
                    </h3>
                    <p className="text-sm leading-relaxed text-zinc-400 font-medium">{analysis.summary}</p>
                  </div>

                  {analysis.tradingPlan && (
                    <div className={cn(
                      "space-y-4 rounded-[2rem] p-8 backdrop-blur-xl border transition-all duration-500",
                      analysis.tradingPlan.entryPrice === '不推荐' 
                        ? "border-rose-500/20 bg-rose-500/5 shadow-[0_0_40px_-15px_rgba(244,63,94,0.1)]" 
                        : "border-emerald-500/20 bg-emerald-500/5 shadow-[0_0_40px_-15px_rgba(16,185,129,0.1)]"
                    )}>
                      <h3 className={cn(
                        "flex items-center gap-2 text-xl font-black tracking-tight",
                        analysis.tradingPlan.entryPrice === '不推荐' ? "text-rose-400" : "text-emerald-400"
                      )}>
                        <Zap size={20} />
                        交易计划 {analysis.tradingPlan.entryPrice === '不推荐' && '(基于安全边际不推荐)'}
                      </h3>
                      {analysis.tradingPlan.entryPrice !== '不推荐' ? (
                        <div className="grid grid-cols-3 gap-4 mb-4">
                          <div className="p-3 rounded-2xl bg-zinc-900/50 border border-zinc-800">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">建议买入</p>
                            <p className="text-sm font-bold text-emerald-400">{analysis.tradingPlan.entryPrice}</p>
                          </div>
                          <div className="p-3 rounded-2xl bg-zinc-900/50 border border-zinc-800">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">目标价位</p>
                            <p className="text-sm font-bold text-blue-400">{analysis.tradingPlan.targetPrice}</p>
                          </div>
                          <div className="p-3 rounded-2xl bg-zinc-900/50 border border-zinc-800">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">止损价位</p>
                            <p className="text-sm font-bold text-rose-400">{analysis.tradingPlan.stopLoss}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-center">
                          <p className="text-sm font-bold text-rose-400">当前估值或风险不符合安全边际要求，暂不推荐买入计划。</p>
                        </div>
                      )}
                      <div className="p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">操作策略</p>
                        <p className="text-sm leading-relaxed text-zinc-300 italic">{analysis.tradingPlan.strategy}</p>
                      </div>
                    </div>
                  )}

                  <div className="space-y-4 rounded-3xl border border-zinc-800 bg-zinc-900/50 p-6">
                    <h3 className="flex items-center gap-2 text-lg font-semibold">
                      <Newspaper size={18} className="text-zinc-500" />
                      相关新闻
                    </h3>
                    <div className="space-y-4">
                      {analysis.news?.map((item, i) => (
                        <a key={i} href={item.url} target="_blank" rel="noopener noreferrer" className="block group">
                          <div className="mb-1 flex items-start justify-between gap-2">
                            <h4 className="line-clamp-1 text-sm font-medium transition-colors group-hover:text-emerald-400">{item.title}</h4>
                            <ExternalLink size={12} className="shrink-0 text-zinc-600 transition-colors group-hover:text-emerald-400" />
                          </div>
                          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                            <span>{item.source}</span>
                            <span>•</span>
                            <span>{item.time}</span>
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-8">
                <div className="relative overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
                  <div className="absolute left-0 top-0 h-1 w-full bg-zinc-800">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${analysis.score}%` }}
                      transition={{ duration: 1, delay: 0.5 }}
                      className={cn('h-full', analysis.score >= 70 ? 'bg-emerald-500' : analysis.score >= 40 ? 'bg-amber-500' : 'bg-rose-500')}
                    />
                  </div>

                  <p className="mb-4 font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">AI 信心评分</p>
                  <div className="relative inline-block">
                    <span className="text-8xl font-black tracking-tighter text-white">{analysis.score}</span>
                    <span className="absolute -right-4 -top-2 font-bold text-zinc-600">/100</span>
                  </div>

                  <div className="mt-8 space-y-2">
                    <div className={cn('inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-bold uppercase tracking-widest', analysis.sentiment === 'Bullish' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400' : analysis.sentiment === 'Bearish' ? 'border-rose-500/20 bg-rose-500/10 text-rose-400' : 'border-zinc-500/20 bg-zinc-500/10 text-zinc-400')}>
                      {analysis.sentiment === 'Bullish' ? '看涨' : analysis.sentiment === 'Bearish' ? '看跌' : '中性'} 情绪
                    </div>
                    <div className="mt-4 text-2xl font-bold text-white">
                      {analysis.recommendation === 'Strong Buy' ? '强烈买入' : analysis.recommendation === 'Buy' ? '买入' : analysis.recommendation === 'Hold' ? '持有' : analysis.recommendation === 'Sell' ? '卖出' : '强烈卖出'}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-3xl border border-zinc-800 bg-zinc-900/50 p-6">
                    <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-emerald-400">
                      <Zap size={16} />
                      潜在机会
                    </h3>
                    <ul className="space-y-3">
                      {analysis.keyOpportunities?.map((opp, i) => (
                        <li key={i} className="flex items-start gap-3 text-sm text-zinc-400">
                          <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-500" />
                          {opp}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-3xl border border-zinc-800 bg-zinc-900/50 p-6">
                    <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-rose-400">
                      <ShieldAlert size={16} />
                      核心风险
                    </h3>
                    <ul className="space-y-3">
                      {analysis.keyRisks?.map((risk, i) => (
                        <li key={i} className="flex items-start gap-3 text-sm text-zinc-400">
                          <AlertCircle size={16} className="mt-0.5 shrink-0 text-rose-500" />
                          {risk}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="rounded-3xl border border-zinc-800 bg-zinc-900/50 p-8 backdrop-blur-sm">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-400">
                      <MessageSquare size={20} />
                      <h2 className="text-xl font-semibold">AI 深度追问</h2>
                    </div>
                    <button
                      onClick={handleSendChatReport}
                      disabled={isGeneratingReport || isSendingReport || !chatHistory || chatHistory.length === 0}
                      className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                        reportStatus === 'success' 
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/50"
                          : reportStatus === 'error'
                          ? "bg-rose-500/20 text-rose-400 border border-rose-500/50"
                          : "bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-zinc-300"
                      )}
                    >
                      {isGeneratingReport ? (
                        <>
                          <Loader2 className="animate-spin" size={12} />
                          生成中...
                        </>
                      ) : isSendingReport ? (
                        <>
                          <Loader2 className="animate-spin" size={12} />
                          发送中...
                        </>
                      ) : reportStatus === 'success' ? (
                        <>
                          <CheckCircle2 size={12} />
                          已发送
                        </>
                      ) : (
                        <>
                          <Share2 size={12} />
                          整理发送飞书
                        </>
                      )}
                    </button>
                  </div>
                  <p className="mb-4 text-sm leading-relaxed text-zinc-500">继续追问买点、仓位、风险、估值或交易计划。</p>

                  <div className="mb-4 flex flex-wrap gap-2">
                    {chatPrompts.map((p) => (
                      <button key={p} type="button" onClick={() => void handleChat(p)} disabled={isChatting} className="rounded-full border border-zinc-700 bg-zinc-800/80 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-emerald-500/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-60">
                        {p}
                      </button>
                    ))}
                  </div>

                  <div className="mb-6 max-h-96 space-y-4 overflow-y-auto pr-2 custom-scrollbar">
                    {chatHistory?.map((msg, idx) => (
                      <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${msg.role === 'user' ? 'rounded-tr-none bg-emerald-600 text-white' : 'rounded-tl-none bg-zinc-800 text-zinc-300'}`}>
                          {msg.content}
                        </div>
                      </div>
                    ))}
                    {isChatting && (
                      <div className="flex justify-start">
                        <div className="animate-pulse rounded-2xl rounded-tl-none bg-zinc-800 px-4 py-2 text-sm text-zinc-500">AI 正在整理分析...</div>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={chatMessage}
                      onChange={(e) => setChatMessage(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && void handleChat()}
                      placeholder="继续追问 AI..."
                      className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2 text-white transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    />
                    <button onClick={() => void handleChat()} disabled={isChatting || !chatMessage.trim()} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-white transition-all hover:bg-emerald-500 disabled:opacity-50">
                      <Send size={16} />
                    </button>
                  </div>
                </motion.div>
              </div>
            </div>
          </motion.main>
          ) : (
            <motion.div initial={{ opacity: 1 }} animate={{ opacity: 1 }} className="space-y-12">
              <section className="space-y-8">
                <div className="flex items-center justify-between glass-panel px-8 py-6 rounded-3xl">
                  <h2 className="flex items-center gap-3 text-2xl font-black tracking-tighter">
                    <Globe size={28} className="text-emerald-500" />
                    今日大盘概览
                  </h2>
                  <div className="flex items-center gap-4">
                    {overviewLoading && <Loader2 className="animate-spin text-emerald-500" size={20} />}
                    <button
                      onClick={handleSendDailyReport}
                      disabled={overviewLoading || isGeneratingReport || isSendingReport || !marketOverview}
                      className={cn(
                        "flex items-center gap-2 px-6 py-2.5 rounded-2xl text-sm font-bold transition-all shadow-lg",
                        reportStatus === 'success' 
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/50"
                          : reportStatus === 'error'
                          ? "bg-rose-500/20 text-rose-400 border border-rose-500/50"
                          : "bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-zinc-200"
                      )}
                    >
                      {isGeneratingReport ? (
                        <>
                          <Loader2 className="animate-spin" size={16} />
                          生成报告中...
                        </>
                      ) : isSendingReport ? (
                        <>
                          <Loader2 className="animate-spin" size={16} />
                          发送至飞书...
                        </>
                      ) : reportStatus === 'success' ? (
                        <>
                          <CheckCircle2 size={16} />
                          已发送
                        </>
                      ) : (
                        <>
                          <Share2 size={16} />
                          发送每日简报
                        </>
                      )}
                    </button>

                  </div>
                </div>

                {overviewError && <ErrorNotice title="市场概览加载失败" message={overviewError} />}

                <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
                  {overviewLoading ? Array(5).fill(0).map((_, i) => (
                    <div key={i} className="h-24 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/50" />
                  )) : marketOverview?.indices?.map((index, i) => (
                    <div key={i} className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
                      <p className="mb-1 text-xs font-medium text-zinc-500">{index.name}</p>
                      <p className="text-lg font-bold tracking-tight">{index.price.toLocaleString()}</p>
                      <div className={cn('mt-1 flex items-center gap-1 font-mono text-xs', index.change >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                        {index.change >= 0 ? '+' : ''}{index.changePercent}%
                      </div>
                    </div>
                  ))}
                </div>

                {!overviewLoading && marketOverview && (
                  <>
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                      <div className="rounded-[2rem] glass-panel p-8 md:col-span-2">
                        <p className="text-base italic leading-relaxed text-zinc-300 font-medium">"{marketOverview.marketSummary}"</p>
                      </div>
                      <div className="flex flex-col items-center justify-center rounded-[2rem] glass-panel p-8 text-center">
                        <h3 className="mb-4 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">市场情绪</h3>
                        <div className="text-4xl font-black text-emerald-500 tracking-tighter">
                          {(marketOverview.marketSummary?.includes('牛') || marketOverview.marketSummary?.includes('涨')) ? '看多' : (marketOverview.marketSummary?.includes('熊') || marketOverview.marketSummary?.includes('跌')) ? '看空' : '中性'}
                        </div>
                        <p className="mt-3 text-[10px] font-bold text-zinc-600 uppercase tracking-widest">AI 综合研判</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                      <div className="space-y-4 rounded-3xl border border-zinc-800/50 bg-zinc-900/30 p-6">
                        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-zinc-500">
                          <LayoutGrid size={16} className="text-emerald-500" />
                          热门板块分析
                        </h3>
                        <div className="space-y-3">
                          {marketOverview.sectorAnalysis?.map((sector, i) => (
                            <div key={i} className="rounded-xl bg-zinc-800/30 p-3 border border-zinc-700/30">
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-bold text-zinc-200">{sector.name}</span>
                                <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase", 
                                  sector.trend.includes('涨') || sector.trend.includes('强') ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                                )}>{sector.trend}</span>
                              </div>
                              <p className="text-xs text-zinc-500 leading-relaxed">{sector.conclusion}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-4 rounded-3xl border border-zinc-800/50 bg-zinc-900/30 p-6">
                        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-zinc-500">
                          <Coins size={16} className="text-amber-500" />
                          大宗商品走势
                        </h3>
                        <div className="space-y-3">
                          {marketOverview.commodityAnalysis?.map((item, i) => (
                            <div key={i} className="rounded-xl bg-zinc-800/30 p-3 border border-zinc-700/30">
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-bold text-zinc-200">{item.name}</span>
                                <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase", 
                                  item.trend.includes('涨') || item.trend.includes('强') ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                                )}>{item.trend}</span>
                              </div>
                              <p className="text-xs text-zinc-500 leading-relaxed">{item.expectation}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 rounded-3xl border border-zinc-800/50 bg-zinc-900/30 p-6">
                      <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-zinc-500">
                        <Star size={16} className="text-blue-500" />
                        AI 推荐标的/板块
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {marketOverview.recommendations?.map((rec, i) => (
                          <div key={i} className="rounded-xl bg-zinc-800/30 p-4 border border-zinc-700/30">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-bold uppercase">{rec.type}</span>
                              <span className="font-bold text-zinc-100">{rec.name}</span>
                            </div>
                            <p className="text-xs text-zinc-500 leading-relaxed">{rec.reason}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </section>

              <section className="grid grid-cols-1 gap-8 lg:grid-cols-3">
                <div className="space-y-6 lg:col-span-2">
                  <h2 className="flex items-center gap-2 text-xl font-bold">
                    <Newspaper size={20} className="text-blue-500" />
                    重要财经新闻
                  </h2>
                  <div className="space-y-4">
                    {overviewLoading ? Array(3).fill(0).map((_, i) => (
                      <div key={i} className="h-32 animate-pulse rounded-3xl border border-zinc-800 bg-zinc-900/50" />
                    )) : marketOverview?.topNews?.map((news, i) => (
                      <a key={i} href={news.url} target="_blank" rel="noopener noreferrer" className="group block rounded-3xl border border-zinc-800 bg-zinc-900/50 p-6 transition-all hover:border-emerald-500/30">
                        <div className="mb-2 flex items-start justify-between gap-4">
                          <h3 className="text-lg font-semibold transition-colors group-hover:text-emerald-400">{news.title}</h3>
                          <ExternalLink size={16} className="mt-1 shrink-0 text-zinc-600" />
                        </div>
                        <p className="mb-3 line-clamp-2 text-sm text-zinc-400">{news.summary}</p>
                        <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                          <span className="rounded bg-zinc-800 px-2 py-0.5">{news.source}</span>
                          <span>{news.time}</span>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>

                <div className="space-y-6">
                  <h2 className="flex items-center gap-2 text-xl font-bold">
                    <TrendingUp size={20} className="text-amber-500" />
                    热门搜索
                  </h2>
                  <div className="grid grid-cols-1 gap-3">
                    {[
                      { symbol: '600519', name: '贵州茅台', market: "A-Share" as Market },
                      { symbol: '300750', name: '宁德时代', market: "A-Share" as Market },
                      { symbol: '700', name: '腾讯控股', market: "HK-Share" as Market },
                      { symbol: 'NVDA', name: '英伟达', market: "US-Share" as Market },
                    ].map((stock) => (
                      <button key={stock.symbol} onClick={() => { setSymbol(stock.symbol); setMarket(stock.market); }} className="group flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 text-left transition-all hover:border-emerald-500/50">
                        <div>
                          <p className="mb-0.5 font-mono text-[10px] uppercase text-zinc-600">{stock.market}</p>
                          <p className="font-bold transition-colors group-hover:text-emerald-400">{stock.symbol}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-zinc-500">{stock.name}</p>
                          <Search size={14} className="ml-auto mt-1 text-zinc-700" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            </motion.div>
          )}
        </AnimatePresence>

        {showAdminPanel && (
          <section className="space-y-8 pt-12 border-t border-zinc-900 mt-12">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-6">
                <h2 className="flex items-center gap-2 text-xl font-bold">
                  <Zap size={20} className="text-emerald-500" />
                  优化思考链路日志
                </h2>
                <div className="space-y-3 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                  {optimizationLogs.slice().reverse().map((log, i) => (
                    <div 
                      key={i} 
                      className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/30 text-xs cursor-pointer hover:border-emerald-500/30 transition-all group"
                      onClick={() => setSelectedDetail({ type: 'log', data: log })}
                    >
                      <div className="flex justify-between mb-2">
                        <span className="font-bold text-emerald-400 uppercase tracking-wider">{log.field}</span>
                        <span className="text-zinc-600">{new Date(log.timestamp).toLocaleString()}</span>
                      </div>
                      <p className="text-zinc-300 line-clamp-2 mb-2">{log.description}</p>
                      <div className="flex items-center gap-1 text-[10px] text-emerald-500/50 group-hover:text-emerald-500 transition-colors">
                        <Zap size={10} />
                        点击查看完整优化链路
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-6">
                <h2 className="flex items-center gap-2 text-xl font-bold">
                  <Newspaper size={20} className="text-blue-500" />
                  分析备份历史
                </h2>
                <div className="space-y-3 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                  {historyItems.map((item, i) => (
                    <div 
                      key={i} 
                      className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/30 text-xs cursor-pointer hover:border-blue-500/30 transition-all group"
                      onClick={() => setSelectedDetail({ type: 'history', data: item })}
                    >
                      <div className="flex justify-between mb-2">
                        <span className="font-bold text-blue-400 uppercase tracking-wider">
                          {item.stockInfo ? `STOCK: ${item.stockInfo.symbol}` : 'MARKET OVERVIEW'}
                        </span>
                        <span className="text-zinc-600">{item.stockInfo?.lastUpdated || 'RECENT'}</span>
                      </div>
                      <p className="text-zinc-400 line-clamp-2 mb-2">
                        {item.summary || item.marketSummary}
                      </p>
                      <div className="flex items-center gap-1 text-[10px] text-blue-500/50 group-hover:text-blue-500 transition-colors">
                        <Newspaper size={10} />
                        点击展开深度分析报告
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedDetail && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedDetail(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-[2.5rem] border border-zinc-800 bg-zinc-900 shadow-2xl flex flex-col"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-zinc-800 p-6 md:px-8">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "p-3 rounded-2xl",
                    selectedDetail.type === 'log' ? "bg-emerald-500/10 text-emerald-500" : "bg-blue-500/10 text-blue-500"
                  )}>
                    {selectedDetail.type === 'log' ? <Zap size={24} /> : <Newspaper size={24} />}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">
                      {selectedDetail.type === 'log' ? "优化思考链路日志" : "深度分析备份报告"}
                    </h3>
                    <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest mt-1">
                      {selectedDetail.type === 'log' 
                        ? `FIELD: ${selectedDetail.data.field} • ${new Date(selectedDetail.data.timestamp).toLocaleString()}`
                        : `${selectedDetail.data.stockInfo?.symbol || 'MARKET'} • ${selectedDetail.data.stockInfo?.lastUpdated || 'RECENT'}`
                      }
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {selectedDetail.type === 'history' && (
                    <button
                      onClick={() => handleSendHistoryToFeishu(selectedDetail.data)}
                      disabled={isSendingReport}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all",
                        reportStatus === 'success' 
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/50"
                          : reportStatus === 'error'
                          ? "bg-rose-500/20 text-rose-400 border border-rose-500/50"
                          : "bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-zinc-300"
                      )}
                    >
                      {isSendingReport ? (
                        <>
                          <Loader2 className="animate-spin" size={14} />
                          发送中...
                        </>
                      ) : reportStatus === 'success' ? (
                        <>
                          <CheckCircle2 size={14} />
                          已发送
                        </>
                      ) : (
                        <>
                          <Share2 size={14} />
                          发送至飞书
                        </>
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedDetail(null)}
                    className="p-2 rounded-xl hover:bg-zinc-800 transition-colors text-zinc-500 hover:text-white"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
                {selectedDetail.type === 'log' ? (
                  <div className="space-y-8">
                    <div className="space-y-4">
                      <h4 className="text-sm font-bold uppercase tracking-widest text-zinc-500">操作描述</h4>
                      <p className="text-lg leading-relaxed text-zinc-200">{selectedDetail.data.description}</p>
                    </div>
                    
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <h4 className="text-sm font-bold uppercase tracking-widest text-zinc-700">优化前 (Old Value)</h4>
                        <div className="rounded-3xl bg-zinc-950 p-6 border border-zinc-800/50">
                          <pre className="text-sm font-mono text-zinc-500 whitespace-pre-wrap leading-relaxed">
                            {typeof selectedDetail.data.oldValue === 'object' 
                              ? JSON.stringify(selectedDetail.data.oldValue, null, 2) 
                              : selectedDetail.data.oldValue}
                          </pre>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <h4 className="text-sm font-bold uppercase tracking-widest text-emerald-900/50">优化后 (New Value)</h4>
                        <div className="rounded-3xl bg-emerald-950/10 p-6 border border-emerald-500/20">
                          <pre className="text-sm font-mono text-emerald-400/80 whitespace-pre-wrap leading-relaxed">
                            {typeof selectedDetail.data.newValue === 'object' 
                              ? JSON.stringify(selectedDetail.data.newValue, null, 2) 
                              : selectedDetail.data.newValue}
                          </pre>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {selectedDetail.data.stockInfo && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                          { label: '股票名称', value: selectedDetail.data.stockInfo.name, color: 'text-white' },
                          { label: '当前价格', value: `${selectedDetail.data.stockInfo.price} (${selectedDetail.data.stockInfo.changePercent}%)`, color: selectedDetail.data.stockInfo.change >= 0 ? 'text-emerald-400' : 'text-rose-400' },
                          { label: 'AI 评级', value: selectedDetail.data.recommendation, color: 'text-amber-400' },
                          { label: '市场情绪', value: selectedDetail.data.sentiment, color: 'text-blue-400' },
                        ].map((stat, i) => (
                          <div key={i} className="p-4 rounded-2xl bg-zinc-800/50 border border-zinc-700/50">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">{stat.label}</p>
                            <p className={cn("text-lg font-bold", stat.color)}>{stat.value}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="space-y-4">
                      <h4 className="text-sm font-bold uppercase tracking-widest text-zinc-500">分析摘要</h4>
                      <p className="text-xl font-medium leading-relaxed text-zinc-100">
                        {selectedDetail.data.summary || selectedDetail.data.marketSummary}
                      </p>
                    </div>

                    {selectedDetail.data.finalConclusion && (
                      <div className="space-y-4">
                        <h4 className="text-sm font-bold uppercase tracking-widest text-emerald-500">首席策略师总结结论</h4>
                        <div className="p-6 rounded-3xl bg-emerald-500/5 border border-emerald-500/20">
                          <p className="text-lg leading-relaxed text-emerald-100 italic">
                            {selectedDetail.data.finalConclusion}
                          </p>
                        </div>
                      </div>
                    )}

                    {selectedDetail.data.tradingPlan && (
                      <div className="space-y-4">
                        <h4 className="text-sm font-bold uppercase tracking-widest text-emerald-500">交易计划</h4>
                        <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/5 p-6">
                          <div className="grid grid-cols-3 gap-4 mb-4">
                            <div className="p-3 rounded-2xl bg-zinc-900/50 border border-zinc-800">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">建议买入</p>
                              <p className="text-sm font-bold text-emerald-400">{selectedDetail.data.tradingPlan.entryPrice}</p>
                            </div>
                            <div className="p-3 rounded-2xl bg-zinc-900/50 border border-zinc-800">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">目标价位</p>
                              <p className="text-sm font-bold text-blue-400">{selectedDetail.data.tradingPlan.targetPrice}</p>
                            </div>
                            <div className="p-3 rounded-2xl bg-zinc-900/50 border border-zinc-800">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">止损价位</p>
                              <p className="text-sm font-bold text-rose-400">{selectedDetail.data.tradingPlan.stopLoss}</p>
                            </div>
                          </div>
                          <div className="p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">操作策略</p>
                            <p className="text-sm leading-relaxed text-zinc-300 italic">{selectedDetail.data.tradingPlan.strategy}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedDetail.data.technicalAnalysis && (
                      <div className="space-y-4">
                        <h4 className="text-sm font-bold uppercase tracking-widest text-zinc-500">技术面分析</h4>
                        <p className="text-base leading-relaxed text-zinc-300">{selectedDetail.data.technicalAnalysis}</p>
                      </div>
                    )}

                    {selectedDetail.data.fundamentalAnalysis && (
                      <div className="space-y-4">
                        <h4 className="text-sm font-bold uppercase tracking-widest text-zinc-500">基本面分析</h4>
                        <p className="text-base leading-relaxed text-zinc-300">{selectedDetail.data.fundamentalAnalysis}</p>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {selectedDetail.data.keyOpportunities && selectedDetail.data.keyOpportunities.length > 0 && (
                        <div className="space-y-4">
                          <h4 className="text-sm font-bold uppercase tracking-widest text-emerald-500/50">核心机会</h4>
                          <ul className="list-disc list-inside space-y-2 text-sm text-emerald-400/80">
                            {selectedDetail.data.keyOpportunities.map((opp: string, i: number) => (
                              <li key={i}>{opp}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {selectedDetail.data.keyRisks && selectedDetail.data.keyRisks.length > 0 && (
                        <div className="space-y-4">
                          <h4 className="text-sm font-bold uppercase tracking-widest text-rose-500/50">核心风险</h4>
                          <ul className="list-disc list-inside space-y-2 text-sm text-rose-400/80">
                            {selectedDetail.data.keyRisks.map((risk: string, i: number) => (
                              <li key={i}>{risk}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    <div className="space-y-4">
                      <h4 className="text-sm font-bold uppercase tracking-widest text-zinc-500">原始数据结构 (JSON)</h4>
                      <div className="rounded-3xl bg-zinc-950 p-6 border border-zinc-800/50">
                        <pre className="text-sm font-mono text-zinc-400 whitespace-pre-wrap leading-relaxed">
                          {JSON.stringify(selectedDetail.data, null, 2)}
                        </pre>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <footer className="mx-auto mt-12 max-w-7xl border-t border-zinc-900 px-4 py-12 md:px-8">
        <div className="flex flex-col items-center justify-between gap-6 font-mono text-xs uppercase tracking-widest text-zinc-600 md:flex-row">
          <div className="text-center md:text-left">
            <p>© 2026 每日股票智能分析 AI</p>
          </div>
          <div className="flex gap-8">
            <a href="#" className="transition-colors hover:text-zinc-400">数据来源</a>
            <a href="#" className="transition-colors hover:text-zinc-400">服务条款</a>
            <a href="#" className="transition-colors hover:text-zinc-400">隐私政策</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
