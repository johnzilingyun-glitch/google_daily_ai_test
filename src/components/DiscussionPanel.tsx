import React, { useEffect, useRef } from 'react';
import { AgentRole } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { User, Shield, BarChart3, PieChart, MessageSquare, Loader2, Download, Search, Zap, Send, HelpCircle, UserCheck, ExternalLink, AlertTriangle, Award, X, Maximize2, Minimize2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAnalysisStore } from '../stores/useAnalysisStore';
import { useUIStore } from '../stores/useUIStore';

interface DiscussionPanelProps {
  onSendMessage?: (message: string) => void;
  onClose?: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onPointerDownDrag?: (e: React.PointerEvent<HTMLDivElement>) => void;
}

const roleIcons: Record<AgentRole, React.ReactNode> = {
  "Technical Analyst": <BarChart3 size={18} />,
  "Fundamental Analyst": <PieChart size={18} />,
  "Sentiment Analyst": <MessageSquare size={18} />,
  "Risk Manager": <Shield size={18} />,
  "Contrarian Strategist": <Zap size={18} />,
  "Deep Research Specialist": <Search size={18} />,
  "Professional Reviewer": <UserCheck size={18} />,
  "Chief Strategist": <Award size={18} />,
  "Moderator": <User size={18} />,
};

const roleColors: Record<AgentRole, string> = {
  "Technical Analyst": "text-blue-400 bg-blue-500/10 border-blue-500/20",
  "Fundamental Analyst": "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  "Sentiment Analyst": "text-purple-400 bg-purple-500/10 border-purple-500/20",
  "Risk Manager": "text-rose-400 bg-rose-500/10 border-rose-500/20",
  "Contrarian Strategist": "text-orange-400 bg-orange-500/10 border-orange-500/20",
  "Deep Research Specialist": "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  "Professional Reviewer": "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
  "Chief Strategist": "text-amber-400 bg-amber-500/10 border-amber-500/20",
  "Moderator": "text-zinc-400 bg-zinc-500/10 border-zinc-500/20",
};

const roleNames: Record<AgentRole, string> = {
  "Technical Analyst": "技术分析师",
  "Fundamental Analyst": "基本面分析师",
  "Sentiment Analyst": "情绪分析师",
  "Risk Manager": "风险合规官",
  "Contrarian Strategist": "反向策略师",
  "Deep Research Specialist": "深度研究专家",
  "Professional Reviewer": "高级评审专家",
  "Chief Strategist": "首席策略师",
  "Moderator": "研讨主持人",
};

export const DiscussionPanel: React.FC<DiscussionPanelProps> = ({ 
  onSendMessage,
  onClose,
  isFullscreen,
  onToggleFullscreen,
  onPointerDownDrag
}) => {
  const { 
    discussionMessages: messages, 
    analystWeights,
    analysis
  } = useAnalysisStore();
  
  const { 
    isDiscussing, 
    isReviewing 
  } = useUIStore();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = React.useState('');
  const stockSymbol = analysis?.stockInfo?.symbol;

  const getWeightInfo = (role: AgentRole) => {
    return analystWeights?.find(w => w.role === role);
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (inputValue.trim() && onSendMessage) {
      onSendMessage(inputValue.trim());
      setInputValue('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleDownload = () => {
    if (messages.length === 0) return;

    const content = messages.map(msg => {
      const time = new Date(msg.timestamp).toLocaleString();
      const roleName = roleNames[msg.role] || msg.role;
      return `### [${roleName}] - ${time}\n\n${msg.content}\n\n---\n\n`;
    }).join('\n');

    const header = `# AI 专家组联席会议记录 - ${stockSymbol || '未知股票'}\n生成时间: ${new Date().toLocaleString()}\n\n---\n\n`;
    const fullContent = header + content;

    const blob = new Blob([fullContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AI_Discussion_${stockSymbol || 'Report'}_${new Date().toISOString().split('T')[0]}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 overflow-hidden">
      <div 
        className={`p-6 border-b border-slate-700/70 bg-slate-800 flex items-center justify-between shadow-sm select-none ${onPointerDownDrag ? 'cursor-grab active:cursor-grabbing' : ''}`}
        onPointerDown={onPointerDownDrag}
      >
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
            <div className="absolute inset-0 w-3 h-3 rounded-full bg-emerald-500 animate-ping opacity-75" />
          </div>
          <h3 className="text-base font-black uppercase tracking-[0.2em] text-slate-200">AI 专家组联席会议</h3>
        </div>
        <div 
          className="flex items-center gap-4"
          onPointerDown={(e) => e.stopPropagation()} // Prevent dragging when interacting with buttons
        >
          {messages.length > 0 && !isDiscussing && (
            <button 
              onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 border border-slate-600 text-xs font-bold text-white transition-colors"
              title="下载研讨记录"
            >
              <Download size={16} />
              导出完整记录
            </button>
          )}
          {isDiscussing && (
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-xs font-bold text-slate-400 uppercase tracking-widest">
              <Loader2 size={14} className="animate-spin text-emerald-500" />
              全网推演中
            </div>
          )}
          {onToggleFullscreen && (
            <button
              onClick={onToggleFullscreen}
              className="p-2 hover:bg-slate-700 rounded-xl text-slate-400 hover:text-white transition-colors"
              title={isFullscreen ? "退出全屏" : "全屏显示"}
            >
              {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-700 rounded-xl text-slate-400 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          )}
        </div>
      </div>

      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-8 space-y-10 scrollbar-hide bg-slate-900/80"
      >
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <motion.div
              key={msg.id || `msg-${i}`}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ type: "spring", stiffness: 100, damping: 15 }}
              className="flex gap-6 group max-w-4xl mx-auto"
            >
              <div className={`flex-shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center border transition-all duration-300 group-hover:scale-110 shadow-lg ${roleColors[msg.role] || "text-slate-400 bg-slate-800 border-slate-700"}`}>
                {roleIcons[msg.role] || <MessageSquare size={24} />}
              </div>
              <div className="flex-1 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-black uppercase tracking-widest px-3 py-1 rounded-lg border shadow-sm ${roleColors[msg.role] || "text-slate-300 bg-slate-800 border-slate-700"}`}>
                      {roleNames[msg.role] || msg.role}
                    </span>
                    {getWeightInfo(msg.role)?.isExpert && (
                      <span className="text-xs font-bold text-amber-500 bg-amber-500/10 px-3 py-1 rounded-lg border border-amber-500/20 flex items-center gap-1.5 animate-pulse">
                        <Award size={14} />
                        行业专家 ({getWeightInfo(msg.role)?.expertiseArea})
                      </span>
                    )}
                    {msg.type === "research" && (
                      <span className="text-xs font-bold text-cyan-400 bg-cyan-500/10 px-3 py-1 rounded-lg border border-cyan-500/20 flex items-center gap-1.5">
                        <Search size={14} />
                        深度研究
                      </span>
                    )}
                    {msg.type === "review" && (
                      <span className="text-xs font-bold text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-lg border border-indigo-500/20 flex items-center gap-1.5">
                        <UserCheck size={14} />
                        专家评审
                      </span>
                    )}
                    {msg.type === "fact_check" && (
                      <span className="text-xs font-bold text-rose-400 bg-rose-500/10 px-3 py-1 rounded-lg border border-rose-500/20 flex items-center gap-1.5">
                        <AlertTriangle size={14} />
                        一致性监测
                      </span>
                    )}
                    {msg.type === "user_question" && (
                      <span className="text-xs font-bold text-slate-300 bg-slate-800 px-3 py-1 rounded-lg border border-slate-700 flex items-center gap-1.5">
                        <HelpCircle size={14} />
                        用户提问
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-slate-500 font-mono font-bold">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
                <div className="relative">
                  <div className={`text-[15px] leading-7 p-6 rounded-3xl rounded-tl-none border shadow-xl transition-all duration-300 ${
                    msg.type === "research" ? "bg-[#0b1b26] border-cyan-500/30 text-cyan-50 shadow-cyan-900/20 group-hover:border-cyan-500/50" :
                    msg.type === "review" ? "bg-[#10101f] border-indigo-500/30 text-indigo-50 shadow-indigo-900/20 group-hover:border-indigo-500/50" :
                    msg.type === "fact_check" ? "bg-[#1f0f13] border-rose-500/30 text-rose-50 shadow-rose-900/20 group-hover:border-rose-500/50" :
                    msg.type === "user_question" ? "bg-slate-800 border-slate-600 text-slate-200 shadow-black/20" :
                    "bg-slate-800/80 border-slate-700 text-slate-200 shadow-black/20 group-hover:border-slate-500"
                  }`}>
                    <div className="prose prose-invert prose-base max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </ReactMarkdown>
                    </div>

                    {msg.references && msg.references.length > 0 && (
                      <div className="mt-5 pt-5 border-t border-white/10">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                          <ExternalLink size={14} />
                          引用来源
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {msg.references.map((ref, idx) => (
                            <a
                              key={idx}
                              href={ref.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-medium text-cyan-400 hover:text-white bg-cyan-950/40 border border-cyan-500/20 px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1.5"
                            >
                              {ref.title.length > 30 ? ref.title.substring(0, 30) + '...' : ref.title}
                              <ExternalLink size={12} />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  {/* Subtle accent line dropshadow focus */}
                  <div className={`absolute left-0 top-0 bottom-0 w-1.5 rounded-full opacity-60 ${(roleColors[msg.role] || "bg-slate-600").split(' ')[0]}`} />
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        
        {messages.length === 0 && !isDiscussing && (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-4">
            <MessageSquare size={64} strokeWidth={1} />
            <p className="text-base">暂无研讨记录，请搜索股票开始分析</p>
          </div>
        )}
      </div>

      {/* Chat Input for Follow-up Questions */}
      {messages.length > 0 && !isDiscussing && onSendMessage && (
        <div className="p-6 border-t border-slate-700/50 bg-slate-800 shadow-inner max-w-4xl mx-auto w-full">
          <div className="relative flex items-center gap-4">
            <div className="flex-1 relative">
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="向专家组提问或要求深度研判..."
                className="w-full bg-slate-900/80 border border-slate-600 rounded-2xl px-6 py-4 pr-16 text-base text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all resize-none shadow-inner h-[60px] flex items-center"
                rows={1}
                disabled={isReviewing}
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                {isReviewing ? (
                  <Loader2 size={24} className="animate-spin text-indigo-400" />
                ) : (
                  <button
                    onClick={handleSend}
                    disabled={!inputValue.trim()}
                    className="p-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white disabled:bg-slate-700 disabled:text-slate-500 transition-all shadow-lg"
                  >
                    <Send size={20} />
                  </button>
                )}
              </div>
            </div>
            <div className="flex-shrink-0">
              <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400" title="专家评审模式已开启">
                <HelpCircle size={26} />
              </div>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-slate-400 px-2 flex items-center gap-1.5 font-bold">
            <Zap size={14} className="text-amber-400" />
            提问后将由 <span className="text-indigo-400">高级评审专家</span> 对当前话题进行深度复核与答疑
          </p>
        </div>
      )}
    </div>
  );
};
