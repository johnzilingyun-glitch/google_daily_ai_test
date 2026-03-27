import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateContentWithUsage, fetchAvailableModelsList } from './geminiService';
import { useConfigStore } from '../stores/useConfigStore';
import { GoogleGenAI } from '@google/genai';

// Mock zustand store
vi.mock('../stores/useConfigStore', () => ({
  useConfigStore: {
    getState: vi.fn(),
  },
}));

// Mock GoogleGenAI
vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: vi.fn().mockImplementation(function() {
      const generateContent = vi.fn().mockImplementation(async ({ model }) => {
        if (model === 'gemini-3-flash-preview') {
          return { text: 'ok' }; // success
        }
        if (model === 'gemini-3.1-pro-preview') {
          throw new Error('429 RESOURCE_EXHAUSTED Quota exceeded'); // fake quota error
        }
        throw new Error('404 Not Found'); // other models fail
      });
      return {
        models: { generateContent }
      };
    })
  };
});

describe('geminiService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateContentWithUsage', () => {
    it('should add token usage to the store when available', async () => {
      const mockAddTokenUsage = vi.fn();
      (useConfigStore.getState as any).mockReturnValue({
        addTokenUsage: mockAddTokenUsage
      });

      const mockAi = {
        models: {
          generateContent: vi.fn().mockResolvedValue({
            text: 'response',
            usageMetadata: {
              promptTokenCount: 10,
              candidatesTokenCount: 20,
              totalTokenCount: 30
            }
          })
        }
      };

      const result = await generateContentWithUsage(mockAi, { model: 'test', contents: 'hello' });
      
      expect(result.text).toBe('response');
      expect(mockAddTokenUsage).toHaveBeenCalledWith({
        promptTokens: 10,
        candidatesTokens: 20,
        totalTokens: 30
      });
    });

    it('should not break if usageMetadata is missing', async () => {
      const mockAddTokenUsage = vi.fn();
      (useConfigStore.getState as any).mockReturnValue({
        addTokenUsage: mockAddTokenUsage
      });

      const mockAi = {
        models: {
          generateContent: vi.fn().mockResolvedValue({
            text: 'response no metadata'
          })
        }
      };

      const result = await generateContentWithUsage(mockAi, { model: 'test', contents: 'hello' });
      
      expect(result.text).toBe('response no metadata');
      expect(mockAddTokenUsage).not.toHaveBeenCalled();
    });
  });

  describe('fetchAvailableModelsList', () => {
    it('should return only models that respond successfully to ping', async () => {
      const availableModels = await fetchAvailableModelsList({ apiKey: 'test_key' });
      
      // Based on our mock, only 'gemini-3-flash-preview' will succeed
      expect(availableModels.length).toBe(1);
      expect(availableModels[0].id).toBe('gemini-3-flash-preview');
    });

    it('should throw an error if no models are available', async () => {
      vi.mocked(GoogleGenAI).mockImplementationOnce(function() {
        return {
          models: {
            generateContent: vi.fn().mockRejectedValue(new Error('429 RESOURCE_EXHAUSTED'))
          }
        };
      } as any);

      await expect(fetchAvailableModelsList({ apiKey: 'test_key' })).rejects.toThrow('无可用模型');
    });
  });
});
