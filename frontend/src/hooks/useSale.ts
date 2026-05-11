import { useState, useEffect, useCallback } from 'react';
import { api } from './api';
import type { SaleStatusResponse, BuyResponse } from '../types/api';

const POLL_INTERVAL_MS = 3000;

export function useSale(userId: string) {
  const [saleStatus, setSaleStatus] = useState<SaleStatusResponse | null>(null);
  const [purchaseResult, setPurchaseResult] = useState<BuyResponse | null>(null);
  const [hasPurchased, setHasPurchased] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Poll sale status every 3 seconds
  useEffect(() => {
    let mounted = true;

    async function fetchStatus() {
      try {
        const status = await api.getSaleStatus();
        if (mounted) setSaleStatus(status);
      } catch {
        if (mounted) setError('Could not reach the server. Is the backend running?');
      }
    }

    fetchStatus();
    const interval = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Check if user already purchased on userId change
  useEffect(() => {
    if (!userId.trim()) return;
    api.getOrder(userId).then((res) => {
      if (res.hasPurchased) {
        setHasPurchased(true);
        setPurchaseResult({
          success: true,
          message: `You already secured an item on ${new Date(res.purchasedAt!).toLocaleString()}.`,
        });
      } else {
        setHasPurchased(false);
        setPurchaseResult(null);
      }
    });
  }, [userId]);

  const buyItem = useCallback(async () => {
    if (!userId.trim() || isLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.buy(userId);
      setPurchaseResult(result);
      if (result.success) {
        setHasPurchased(true);
        // Refresh status immediately to show updated stock
        const status = await api.getSaleStatus();
        setSaleStatus(status);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [userId, isLoading]);

  return { saleStatus, purchaseResult, hasPurchased, isLoading, error, buyItem };
}
