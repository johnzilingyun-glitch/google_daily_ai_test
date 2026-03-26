import React, { useState, useCallback } from 'react';
import { X, Settings, ShieldCheck, Cpu, Eye, EyeOff, RefreshCw, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GeminiConfig } from '../types';
import { GoogleGenAI } from '@google/genai';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: GeminiConfig;
  onConfigChange: (config: GeminiConfig) => void;
}

const PRESET_MODELS = [
  { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash-Lite', description: '超轻量最新模型，极致低延迟，适合大规模翻译/转录/数据提取/文档摘要/路由分类。' },
  { id: 'gemini-2.5-flash-preview-05-20', name: 'Gemini 2.5 Flash', description: '快速平衡模型，适合通用分析。' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: '稳定版快速模型。' },
  { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite', description: '超轻量模型，极致低延迟。' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: '成熟稳定的高级推理模型。' },
];

interface RemoteModel {
  name: string;
  displayName: string;
}

export function SettingsModal({ isOpen, onClose, config, onConfigChange }: SettingsModalProps) {
  const [showKey, setShowKey] = useState(false);
  const [remoteModels, setRemoteModels] = useState<RemoteModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [customModel, setCustomModel] = useState('');

  const fetchRemoteModels = useCallback(async () => {
    if (!config.apiKey) {
      setModelsError('请先输入 API Key');
      return;
    }
    setLoadingModels(true);
    setModelsError(null);
    try {
      const ai = new GoogleGenAI({ apiKey: config.apiKey });
      const pager = await ai.models.list({ config: { pageSize: 100 } });
      const models: RemoteModel[] = [];
      for await (const m of pager) {
        const name = m.name?.replace('models/', '') || '';
        if (name.includes('gemini') && (name.includes('flash') || name.includes('pro') || name.includes('lite'))) {
          models.push({ name, displayName: m.displayName || name });
        }
      }
      models.sort((a, b) => a.name.localeCompare(b.name));
      setRemoteModels(models);
      if (models.length === 0) {
        setModelsError('未找到可用模型，请检查 API Key 权限。');
      }
    } catch (err: any) {
      setModelsError(err.message || '获取模型列表失败');
    } finally {
      setLoadingModels(false);
    }
  }, [config.apiKey]);

  const displayModels = remoteModels.length > 0 ? remoteModels.map(m => ({
    id: m.name,
    name: m.displayName,
    description: m.name,
  })) : PRESET_MODELS;

  return (
    <AnimatePresence>
      {isOpen && (
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

            {/* Content */}
            <div className="p-6 space-y-8">
              {/* API Key Section */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium text-white/60">
                  <ShieldCheck size={16} />
                  <span>API 密钥管理</span>
                </div>
                <div className="rounded-2xl border border-white/5 bg-white/5 p-4 space-y-3">
                  <p className="text-sm text-white/70 leading-relaxed">
                    请输入您的 Gemini API Key。密钥仅保存在浏览器本地，不会上传至服务器。
                  </p>
                  <div className="relative">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={config.apiKey || ''}
                      onChange={(e) => onConfigChange({ ...config, apiKey: e.target.value })}
                      placeholder="AIza..."
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 pr-12 text-sm text-white placeholder-white/30 outline-none transition-colors focus:border-blue-500/50 focus:bg-white/[0.08]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
                    >
                      {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {config.apiKey && (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                      <ShieldCheck size={12} />
                      <span>API Key 已配置</span>
                    </div>
                  )}
                  <p className="text-[10px] text-white/30">
                    获取 API Key：
                    <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="ml-1 text-blue-400 hover:underline">
                      Google AI Studio
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
                    onClick={fetchRemoteModels}
                    disabled={loadingModels}
                    className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-[11px] text-white/50 transition-colors hover:bg-white/10 hover:text-white/80 disabled:opacity-50"
                  >
                    {loadingModels ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                    {remoteModels.length > 0 ? '刷新列表' : '获取可用模型'}
                  </button>
                </div>
                {modelsError && (
                  <p className="text-xs text-amber-400">{modelsError}</p>
                )}
                {remoteModels.length > 0 && (
                  <p className="text-[10px] text-emerald-400/70">✓ 已从 API 获取 {remoteModels.length} 个可用模型</p>
                )}
                <div className="grid gap-3 max-h-64 overflow-y-auto pr-1">
                  {displayModels.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => onConfigChange({ ...config, model: model.id })}
                      className={`flex flex-col gap-1 rounded-2xl border p-4 text-left transition-all ${
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
                      <p className="text-xs text-white/40 leading-relaxed font-mono">
                        {model.description}
                      </p>
                    </button>
                  ))}
                </div>
                {/* Custom model input */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customModel}
                    onChange={(e) => setCustomModel(e.target.value)}
                    placeholder="自定义模型名 (如 gemini-2.0-flash-lite)"
                    className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder-white/25 outline-none focus:border-blue-500/50"
                  />
                  <button
                    onClick={() => {
                      if (customModel.trim()) {
                        onConfigChange({ ...config, model: customModel.trim() });
                        setCustomModel('');
                      }
                    }}
                    disabled={!customModel.trim()}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-medium text-white transition-all hover:bg-blue-500 disabled:opacity-30"
                  >
                    使用
                  </button>
                </div>
                <p className="text-[10px] text-white/30 font-mono">
                  当前: {config.model}
                </p>
              </section>
            </div>

            {/* Footer */}
            <div className="border-t border-white/5 bg-white/[0.02] p-6">
              <button
                onClick={onClose}
                className="w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black transition-all hover:bg-white/90 active:scale-[0.98]"
              >
                保存并关闭
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
