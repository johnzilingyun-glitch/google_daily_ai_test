import { fetchWithTimeout } from './geminiClient';

export async function getHistoryContext(): Promise<any[]> {
  try {
    const response = await fetchWithTimeout('/api/admin/history-context');
    if (response.ok) {
      return await response.json();
    }
  } catch (err) {
    console.error('Failed to fetch history context:', err);
  }
  return [];
}

export async function saveAnalysisToHistory(type: 'market' | 'stock', data: any) {
  try {
    await fetchWithTimeout('/api/admin/save-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, data })
    });
  } catch (err) {
    console.error('Failed to save analysis to history:', err);
  }
}

export async function logOptimization(field: string, oldValue: any, newValue: any, description: string) {
  try {
    await fetchWithTimeout('/api/admin/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field, oldValue, newValue, description })
    });
  } catch (err) {
    console.error('Failed to log optimization:', err);
  }
}
