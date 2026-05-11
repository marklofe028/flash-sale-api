import { useState } from 'react';
import { useSale } from './hooks/useSale';
import type { SaleStatus } from './types/api';

const STATUS_LABELS: Record<SaleStatus, string> = {
  upcoming: '⏳ Sale Starting Soon',
  active: '🔥 Sale is Live!',
  ended: '🏁 Sale Has Ended',
};

const STATUS_COLORS: Record<SaleStatus, string> = {
  upcoming: '#7C3AED',
  active: '#DC2626',
  ended: '#6B7280',
};

function StatusBadge({ status }: { status: SaleStatus }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '6px 16px',
        borderRadius: '999px',
        background: STATUS_COLORS[status],
        color: '#fff',
        fontWeight: 600,
        fontSize: '14px',
        letterSpacing: '0.02em',
      }}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function StockBar({ remaining, total }: { remaining: number; total: number }) {
  const pct = total > 0 ? Math.max(0, (remaining / total) * 100) : 0;
  const color = pct > 40 ? '#16A34A' : pct > 15 ? '#D97706' : '#DC2626';
  return (
    <div style={{ margin: '16px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 14 }}>
        <span style={{ color: '#6B7280' }}>Stock remaining</span>
        <span style={{ fontWeight: 600, color }}>{remaining} / {total}</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: '#E5E7EB', overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: color,
            borderRadius: 4,
            transition: 'width 0.4s ease',
          }}
        />
      </div>
    </div>
  );
}

function CountdownTimer({ targetTime, label }: { targetTime: string; label: string }) {
  const [now, setNow] = useState(Date.now());

  // Update every second
  useState(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  });

  const diff = Math.max(0, new Date(targetTime).getTime() - now);
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div style={{ textAlign: 'center', margin: '12px 0' }}>
      <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.05em' }}>
        {pad(h)}:{pad(m)}:{pad(s)}
      </div>
    </div>
  );
}

export default function App() {
  const [userId, setUserId] = useState('');
  const { saleStatus, purchaseResult, hasPurchased, isLoading, error, buyItem } = useSale(userId);

  const canBuy =
    saleStatus?.status === 'active' &&
    !hasPurchased &&
    userId.trim().length > 0 &&
    !isLoading;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #1E1B4B 0%, #312E81 50%, #1E1B4B 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 20,
          padding: '40px 36px',
          width: '100%',
          maxWidth: 440,
          boxShadow: '0 25px 60px rgba(0,0,0,0.4)',
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>⚡</div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#111827' }}>
            Flash Sale
          </h1>
          <p style={{ margin: '8px 0 16px', color: '#6B7280', fontSize: 14 }}>
            Limited edition · One per customer
          </p>
          {saleStatus && <StatusBadge status={saleStatus.status} />}
        </div>

        {/* Error banner */}
        {error && (
          <div
            style={{
              background: '#FEF2F2',
              border: '1px solid #FECACA',
              borderRadius: 8,
              padding: '10px 14px',
              color: '#DC2626',
              fontSize: 14,
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {!saleStatus && !error && (
          <div style={{ textAlign: 'center', color: '#9CA3AF', padding: '20px 0' }}>
            Connecting to sale server…
          </div>
        )}

        {saleStatus && (
          <>
            {/* Countdown */}
            {saleStatus.status === 'upcoming' && (
              <CountdownTimer targetTime={saleStatus.startTime} label="Sale starts in" />
            )}
            {saleStatus.status === 'active' && (
              <CountdownTimer targetTime={saleStatus.endTime} label="Sale ends in" />
            )}

            {/* Stock bar */}
            <StockBar
              remaining={saleStatus.remainingStock}
              total={saleStatus.totalStock}
            />

            {/* User input */}
            <div style={{ marginBottom: 16 }}>
              <label
                htmlFor="userId"
                style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}
              >
                Your username or email
              </label>
              <input
                id="userId"
                type="text"
                placeholder="e.g. mark@example.com"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                disabled={hasPurchased}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1.5px solid #D1D5DB',
                  fontSize: 15,
                  outline: 'none',
                  boxSizing: 'border-box',
                  background: hasPurchased ? '#F9FAFB' : '#fff',
                  color: '#111827',
                }}
              />
            </div>

            {/* Buy button */}
            <button
              onClick={buyItem}
              disabled={!canBuy}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: 10,
                border: 'none',
                background: canBuy ? '#DC2626' : '#E5E7EB',
                color: canBuy ? '#fff' : '#9CA3AF',
                fontWeight: 700,
                fontSize: 16,
                cursor: canBuy ? 'pointer' : 'not-allowed',
                transition: 'background 0.2s, transform 0.1s',
                transform: isLoading ? 'scale(0.98)' : 'scale(1)',
              }}
            >
              {isLoading ? 'Processing…' : 'Buy Now'}
            </button>

            {/* Purchase result */}
            {purchaseResult && (
              <div
                style={{
                  marginTop: 16,
                  padding: '12px 16px',
                  borderRadius: 10,
                  background: purchaseResult.success ? '#F0FDF4' : '#FEF2F2',
                  border: `1.5px solid ${purchaseResult.success ? '#86EFAC' : '#FECACA'}`,
                  color: purchaseResult.success ? '#15803D' : '#DC2626',
                  fontSize: 14,
                  fontWeight: 500,
                  lineHeight: 1.5,
                }}
              >
                {purchaseResult.message}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
