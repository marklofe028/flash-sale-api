export type SaleStatus = 'upcoming' | 'active' | 'ended';

export interface SaleStatusResponse {
  status: SaleStatus;
  startTime: string;
  endTime: string;
  totalStock: number;
  remainingStock: number;
}

export interface BuyResponse {
  success: boolean;
  message: string;
  reason?: 'already_purchased' | 'out_of_stock' | 'sale_not_active';
  remainingStock?: number;
}

export interface OrderResponse {
  hasPurchased: boolean;
  purchasedAt?: string;
}
