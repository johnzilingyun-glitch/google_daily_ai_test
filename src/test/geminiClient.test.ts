import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithTimeout, delay, getModelName } from '../services/geminiClient';

describe('geminiClient utilities', () => {
  describe('getModelName', () => {
    it('should return default model when no config', () => {
      expect(getModelName()).toBe('gemini-2.5-flash-preview-05-20');
    });

    it('should return config model when provided', () => {
      expect(getModelName({ model: 'custom-model' })).toBe('custom-model');
    });
  });

  describe('delay', () => {
    it('should resolve after specified time', async () => {
      vi.useFakeTimers();
      const promise = delay(100);
      vi.advanceTimersByTime(100);
      await expect(promise).resolves.toBeUndefined();
      vi.useRealTimers();
    });
  });

  describe('fetchWithTimeout', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it('should call fetch with abort signal', async () => {
      const mockResponse = new Response('ok', { status: 200 });
      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse);

      const promise = fetchWithTimeout('/api/test', {}, 5000);
      const result = await promise;

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
      expect(result.status).toBe(200);
    });

    it('should abort on timeout', async () => {
      vi.mocked(global.fetch).mockImplementation(
        (_url, options) =>
          new Promise((_resolve, reject) => {
            (options as RequestInit).signal?.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          })
      );

      const promise = fetchWithTimeout('/api/slow', {}, 1000);
      vi.advanceTimersByTime(1000);

      await expect(promise).rejects.toThrow('aborted');
    });
  });
});
