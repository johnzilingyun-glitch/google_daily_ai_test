import { useState, useEffect } from 'react';
import { UsageStats, getUsageStats, onUsageUpdate } from '../services/usageTracker';

export function useUsageStats(): UsageStats {
  const [stats, setStats] = useState<UsageStats>(getUsageStats);

  useEffect(() => {
    const unsubscribe = onUsageUpdate(setStats);
    // Update RPM/TPM every 5 seconds for rolling window accuracy
    const timer = setInterval(() => setStats(getUsageStats()), 5000);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, []);

  return stats;
}
