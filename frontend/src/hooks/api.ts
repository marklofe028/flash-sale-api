import type { SaleStatusResponse, BuyResponse, OrderResponse } from '../types/api';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  return data as T;
}

export const api = {
  getSaleStatus: (): Promise<SaleStatusResponse> =>
    apiFetch('/sale/status'),

  buy: (userId: string): Promise<BuyResponse> =>
    apiFetch('/sale/buy', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    }),

  getOrder: (userId: string): Promise<OrderResponse> =>
    apiFetch(`/sale/order/${encodeURIComponent(userId)}`),
};
