import React from 'react';
import { X, Settings, ShieldCheck, Cpu, Share2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useConfigStore } from '../stores/useConfigStore';
import { useUIStore } from '../stores/useUIStore';
import { fetchAvailableModelsList } from '../services/geminiService';
import { useState } from 'react';

const AVAILABLE_MODELS = [
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (Fast & Balanced)', description: 'Best for general analysis and quick summaries.' },
  { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro (Advanced Reasoning)', description: 'Best for complex financial logic and deep analysis.' },
  { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash Lite (Ultra Fast)', description: 'Optimized for speed and low-latency tasks.' },
];

export function SettingsModal() {
  const { config, setConfig, tokenUsage, availableModels, setAvailableModels } = useConfigStore();
  const { isSettingsOpen, setIsSettingsOpen } = useUIStore();
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [fetchMessage, setFetchMessage] = useState<{type: 'error' | 'success', text: string} | null>(null);

  const displayModels = availableModels.length > 0 ? availableModels : AVAILABLE_MODELS;

  const handleFetchModels = async () => {
    setIsFetchingModels(true);
    setFetchMessage(null);
    try {
      const models = await fetchAvailableModelsList(config);
      if (models.length > 0) {
        setAvailableModels(models);
        setFetchMessage({ type: 'success', text: `成功接入：找到 ${models.length} 个当前配额可用的模型。` });
      } else {
        setFetchMessage({ type: 'error', text: '未能提取到可用模型。' });
      }
    } catch (e: any) {
      setFetchMessage({ type: 'error', text: e.message || '查询模型失败' });
    } finally {
      setIsFetchingModels(false);
    }
  };

  const handleOpenKeySelector = async () => {
    const aiStudio = (window as any).aistudio;
    if (aiStudio?.openSelectKey) {
      await aiStudio.openSelectKey();
    } else {
      alert('API Key selection is only available in the AI Studio environment.');
    }
  };

  const onClose = () => setIsSettingsOpen(false);

  return (
    <AnimatePresence>
      {isSettingsOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-[#121212] shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/5 p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400">
                  <Settings size={20} />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-white">系统配置</h2>
                  <p className="text-xs text-white/40">自定义您的 AI 分析引擎</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="flex h-10 w-10 items-center justify-center rounded-full text-white/40 transition-colors hover:bg-white/5 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content - Scrollable area */}
            <div className="max-h-[70vh] overflow-y-auto p-6 space-y-6 custom-scrollbar">
              {/* Feishu Notification Section */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium text-white/60">
                  <Share2 size={16} />
                  <span>飞书研报推送配置</span>
                </div>
                <div className="rounded-2xl border border-white/5 bg-white/5 p-4">
                  <p className="text-sm text-white/70 leading-relaxed mb-4">
                    配置飞书群机器人 Webhook，自动将专家组研讨总结与每日早报推送至指定群聊。
                  </p>
                  <input
                    type="password"
                    placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..."
                    id="feishu-webhook-input"
                    value={config.feishuWebhookUrl || ''}
                    onChange={(e) => setConfig({ ...config, feishuWebhookUrl: e.target.value })}
                    className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-2.5 text-sm text-white placeholder-white/30 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition-all font-mono"
                  />
                  <p className="mt-2 text-[10px] text-white/30 italic">
                    提示：在飞书群中添加“自定义机器人”并开启“Webhook”功能。
                  </p>
                </div>
              </section>

              {/* API Key Section */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium text-white/60">
                  <ShieldCheck size={16} />
                  <span>API 密钥管理</span>
                </div>
                <div className="rounded-2xl border border-white/5 bg-white/5 p-4">
                  <p className="text-sm text-white/70 leading-relaxed mb-4">
                    自定义配置您的专属 Gemini API Key。考虑到您的数据安全，密钥仅保存在本地浏览器缓存中，不会被上传。
                  </p>
                  <div className="space-y-3">
                    <input
                      type="password"
                      placeholder="AIzaSy... (输入您的 API Key)"
                      id="api-key-input"
                      value={config.apiKey || ''}
                      onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                      className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-2.5 text-sm text-white placeholder-white/30 focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition-all font-mono"
                    />
                    {(window as any).aistudio?.openSelectKey && (
                      <button
                        onClick={handleOpenKeySelector}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600/20 border border-blue-500/30 px-4 py-2 text-sm font-medium text-blue-400 transition-all hover:bg-blue-600/30 active:scale-[0.98]"
                      >
                        从 Google AI Studio 同步配置
                      </button>
                    )}
                  </div>
                  <p className="mt-3 text-[10px] text-center text-white/30">
                    提示：请确保选择一个已启用计费的 Google Cloud 项目。
                    <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="ml-1 text-blue-400 hover:underline">
                      查看计费文档
                    </a>
                  </p>
                </div>
              </section>

              {/* Model Selection Section */}
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium text-white/60">
                    <Cpu size={16} />
                    <span>模型选择</span>
                  </div>
                  <button 
                    onClick={handleFetchModels}
                    disabled={isFetchingModels}
                    className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg text-white transition-colors"
                  >
                    {isFetchingModels ? '查询中...' : '查询可用模型'}
                  </button>
                </div>
                {fetchMessage && (
                  <p className={`text-xs ${fetchMessage.type === 'error' ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {fetchMessage.text}
                  </p>
                )}
                
                <div className="grid gap-3">
                  {displayModels.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => setConfig({ ...config, model: model.id })}
                      className={`flex flex-col gap-1 rounded-2xl border p-3.5 text-left transition-all ${
                        config.model === model.id
                           ? 'border-blue-500/50 bg-blue-500/10'
                          : 'border-white/5 bg-white/5 hover:border-white/10 hover:bg-white/[0.08]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-medium ${config.model === model.id ? 'text-blue-400' : 'text-white'}`}>
                          {model.name}
                        </span>
                        {config.model === model.id && (
                          <div className="h-2 w-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                        )}
                      </div>
                      <p className="text-xs text-white/40 leading-relaxed">
                        {model.description || model.id}
                      </p>
                    </button>
                  ))}
                </div>
              </section>
            </div>

            {/* Footer */}
            <div className="border-t border-white/5 bg-white/[0.02] p-6">
              <button
                onClick={onClose}
                className="w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black transition-all hover:bg-white/90 active:scale-[0.98]"
              >
                保存配置并开始分析
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>

  );
}
