import { create } from 'zustand';
import { GeminiConfig } from '../types';

interface ConfigState {
  geminiConfig: GeminiConfig;
  setGeminiConfig: (config: GeminiConfig) => void;
  config: GeminiConfig;
  setConfig: (config: GeminiConfig) => void;
}

export const useConfigStore = create<ConfigState>((set) => {
  const initialConfig = (() => {
    try {
      const saved = localStorage.getItem('gemini_config');
      return saved ? JSON.parse(saved) : { model: 'gemini-3-flash-preview' };
    } catch (e) {
      console.error('Failed to parse gemini_config from localStorage:', e);
      return { model: 'gemini-3-flash-preview' };
    }
  })();

  return {
    geminiConfig: initialConfig,
    config: initialConfig,
    setGeminiConfig: (config) => {
      localStorage.setItem('gemini_config', JSON.stringify(config));
      set({ geminiConfig: config, config: config });
    },
    setConfig: (config) => {
      localStorage.setItem('gemini_config', JSON.stringify(config));
      set({ geminiConfig: config, config: config });
    },
  };
});
