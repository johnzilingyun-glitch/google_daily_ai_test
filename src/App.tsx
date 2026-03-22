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
  Share2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Market, MarketOverview, StockAnalysis } from './types';
import { analyzeStock, getMarketOverview, sendChatMessage, getDailyReport, getStockReport, getChatReport } from './services/aiService';

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
        
        // Save to history
        void fetch('/api/admin/save-analysis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'market', data })
        });
      } catch (err) {
        console.error('Failed to fetch market overview:', err);
        const message = err instanceof Error ? err.message : 'Failed to load market overview.';
        setOverviewError(message);
      } finally {
        setOverviewLoading(false);
      }
    }

    void fetchOverview();
  }, []);

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
      const report = await getChatReport(analysis.stockInfo.name, chatHistory);
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
          data: { stock: analysis.stockInfo.name, history: chatHistory }
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to send report');
      }
      
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

      // Save to history
      void fetch('/api/admin/save-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'stock', data: result })
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
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 font-sans selection:bg-emerald-500/30">
      {/* Background Gradients */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] h-[40%] w-[40%] rounded-full bg-emerald-500/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] h-[40%] w-[40%] rounded-full bg-blue-500/10 blur-[120px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-8 md:px-8">
        {/* Header Section */}
        <header className="mb-12 flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
          <div className="cursor-pointer" onClick={resetToHome}>
            <h1 className="bg-gradient-to-r from-white to-zinc-500 bg-clip-text text-4xl font-bold tracking-tight text-transparent">
              每日股票智能分析
            </h1>
            <p className="mt-2 font-mono text-sm uppercase tracking-widest text-zinc-500">
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
              <ErrorNotice title="个股分析加载失败" message={analysisError} />
            </motion.div>
          )}

          {analysis ? (
            <motion.main
              key={analysis.stockInfo?.symbol}
              initial={{ opacity: 1, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="grid grid-cols-1 gap-8 lg:grid-cols-3"
            >
              <div className="lg:col-span-3 flex items-center justify-between">
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

              <div className="space-y-8 lg:col-span-2">
                <div className="rounded-3xl border border-zinc-800 bg-zinc-900/50 p-8 backdrop-blur-sm">
                  <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <div className="mb-1 flex items-center gap-3">
                        <span className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                          {analysis.stockInfo?.market}
                        </span>
                        <h2 className="text-2xl font-bold">{analysis.stockInfo?.name}</h2>
                        <span className="font-mono text-zinc-500">{analysis.stockInfo?.symbol}</span>
                      </div>
                      <div className="flex items-baseline gap-4">
                        <span className="text-6xl font-bold tracking-tighter">
                          {analysis.stockInfo?.price?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          <span className="ml-2 text-2xl uppercase text-zinc-500">{analysis.stockInfo?.currency}</span>
                        </span>
                        <div className={cn('flex items-center gap-1 text-lg font-medium', (analysis.stockInfo?.change ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                          {(analysis.stockInfo?.change ?? 0) >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                          <span>{(analysis.stockInfo?.change ?? 0) >= 0 ? '+' : ''}{analysis.stockInfo?.change}</span>
                          <span>({analysis.stockInfo?.changePercent}%)</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="mb-1 font-mono text-xs uppercase tracking-widest text-zinc-500">最后更新</p>
                      <p className="text-sm text-zinc-400">{analysis.stockInfo?.lastUpdated}</p>
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
                        基本面分析
                      </div>
                      <p className="text-sm leading-relaxed text-zinc-400">{analysis.fundamentalAnalysis}</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                  <div className="space-y-4 rounded-3xl border border-zinc-800 bg-zinc-900/50 p-6">
                    <h3 className="flex items-center gap-2 text-lg font-semibold">
                      <Info size={18} className="text-zinc-500" />
                      核心摘要
                    </h3>
                    <p className="text-sm leading-relaxed text-zinc-400">{analysis.summary}</p>
                  </div>

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
            </motion.main>
          ) : (
            <motion.div initial={{ opacity: 1 }} animate={{ opacity: 1 }} className="space-y-12">
              <section className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-xl font-bold">
                    <Globe size={20} className="text-emerald-500" />
                    今日大盘概览
                  </h2>
                  <div className="flex items-center gap-2">
                    {overviewLoading && <Loader2 className="animate-spin text-zinc-500" size={18} />}
                    <button
                      onClick={handleSendDailyReport}
                      disabled={overviewLoading || isGeneratingReport || isSendingReport || !marketOverview}
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
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                    <div className="rounded-3xl border border-zinc-800/50 bg-zinc-900/30 p-6 md:col-span-2">
                      <p className="text-sm italic leading-relaxed text-zinc-400">"{marketOverview.marketSummary}"</p>
                    </div>
                    <div className="flex flex-col items-center justify-center rounded-3xl border border-zinc-800/50 bg-zinc-900/30 p-6 text-center">
                      <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-zinc-500">市场情绪</h3>
                      <div className="text-2xl font-black text-emerald-500">
                        {(marketOverview.marketSummary?.includes('牛') || marketOverview.marketSummary?.includes('涨')) ? '看多' : (marketOverview.marketSummary?.includes('熊') || marketOverview.marketSummary?.includes('跌')) ? '看空' : '中性'}
                      </div>
                      <p className="mt-2 text-[10px] text-zinc-600">AI 综合研判</p>
                    </div>
                  </div>
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
      </div>

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
