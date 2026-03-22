import React, { useEffect, useRef } from 'react';
import { AgentMessage, AgentRole } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { User, Shield, BarChart3, PieChart, MessageSquare, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface DiscussionPanelProps {
  messages: AgentMessage[];
  isDiscussing: boolean;
}

const roleIcons: Record<AgentRole, React.ReactNode> = {
  "Technical Analyst": <BarChart3 size={18} />,
  "Fundamental Analyst": <PieChart size={18} />,
  "Sentiment Analyst": <MessageSquare size={18} />,
  "Risk Manager": <Shield size={18} />,
  "Moderator": <User size={18} />,
};

const roleColors: Record<AgentRole, string> = {
  "Technical Analyst": "text-blue-400 bg-blue-500/10 border-blue-500/20",
  "Fundamental Analyst": "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  "Sentiment Analyst": "text-purple-400 bg-purple-500/10 border-purple-500/20",
  "Risk Manager": "text-rose-400 bg-rose-500/10 border-rose-500/20",
  "Moderator": "text-amber-400 bg-amber-500/10 border-amber-500/20",
};

const roleNames: Record<AgentRole, string> = {
  "Technical Analyst": "技术分析师",
  "Fundamental Analyst": "基本面分析师",
  "Sentiment Analyst": "情绪分析师",
  "Risk Manager": "风险合规官",
  "Moderator": "首席策略师 (总结)",
};

export const DiscussionPanel: React.FC<DiscussionPanelProps> = ({ messages, isDiscussing }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="flex flex-col h-[600px] bg-zinc-950/50 border border-zinc-800 rounded-[2rem] overflow-hidden backdrop-blur-xl">
      <div className="p-5 border-b border-zinc-800 bg-zinc-900/40 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping opacity-75" />
          </div>
          <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-zinc-400">AI 专家组联席会议</h3>
        </div>
        {isDiscussing && (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-800/50 border border-zinc-700 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
            <Loader2 size={12} className="animate-spin text-emerald-500" />
            正在研讨中
          </div>
        )}
      </div>

      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide"
      >
        <AnimatePresence initial={false}>
          {messages.map((msg, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ type: "spring", stiffness: 100, damping: 15 }}
              className="flex gap-5 group"
            >
              <div className={`flex-shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center border transition-all duration-300 group-hover:scale-110 ${roleColors[msg.role]}`}>
                {roleIcons[msg.role]}
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border ${roleColors[msg.role]}`}>
                      {roleNames[msg.role]}
                    </span>
                  </div>
                  <span className="text-[10px] text-zinc-600 font-mono font-bold">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
                <div className="relative">
                  <div className="text-sm text-zinc-200 leading-relaxed bg-zinc-900/90 p-5 rounded-2xl rounded-tl-none border border-zinc-800/50 shadow-xl group-hover:border-zinc-700 transition-colors">
                    <div className="prose prose-invert prose-sm max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                  {/* Subtle accent line */}
                  <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-full opacity-60 ${roleColors[msg.role].split(' ')[0]}`} />
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        
        {messages.length === 0 && !isDiscussing && (
          <div className="h-full flex flex-col items-center justify-center text-zinc-600 space-y-2">
            <MessageSquare size={48} strokeWidth={1} />
            <p className="text-sm">暂无研讨记录，请搜索股票开始分析</p>
          </div>
        )}
      </div>
    </div>
  );
};
