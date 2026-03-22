import { describe, it, expect } from 'vitest';
import { extractJsonBlock, parseJsonResponse } from '../services/aiService';

describe('AI Service Helpers', () => {
  describe('extractJsonBlock', () => {
    it('should extract JSON from markdown fences', () => {
      const raw = 'Here is the result:\n```json\n{"key": "value"}\n```\nHope this helps!';
      expect(extractJsonBlock(raw)).toBe('{"key": "value"}');
    });

    it('should extract JSON from plain markdown fences', () => {
      const raw = '```\n{"key": "value"}\n```';
      expect(extractJsonBlock(raw)).toBe('{"key": "value"}');
    });

    it('should return raw string if it starts with {', () => {
      const raw = '{"key": "value"}';
      expect(extractJsonBlock(raw)).toBe('{"key": "value"}');
    });

    it('should find braces if no fences are present', () => {
      const raw = 'Some text before {"key": "value"} some text after';
      expect(extractJsonBlock(raw)).toBe('{"key": "value"}');
    });

    it('should throw error if no JSON is found', () => {
      const raw = 'Just some text without braces';
      expect(() => extractJsonBlock(raw)).toThrow('Gemini returned a non-JSON response.');
    });
  });

  describe('parseJsonResponse', () => {
    it('should parse valid JSON', () => {
      const raw = '```json\n{"symbol": "AAPL", "price": 150}\n```';
      const result = parseJsonResponse<{ symbol: string; price: number }>(raw);
      expect(result.symbol).toBe('AAPL');
      expect(result.price).toBe(150);
    });

    it('should throw error for invalid JSON', () => {
      const raw = '```json\n{"symbol": "AAPL", "price": 150\n```'; // Missing closing brace
      expect(() => parseJsonResponse(raw)).toThrow('Failed to parse Gemini JSON response');
    });
  });
});
