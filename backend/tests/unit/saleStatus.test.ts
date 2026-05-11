import { getSaleStatus } from '../../src/services/redis';
import type { SaleConfig } from '../../src/services/redis';

const makeConfig = (offsetStartMs: number, offsetEndMs: number): SaleConfig => ({
  startTime: new Date(Date.now() + offsetStartMs).toISOString(),
  endTime: new Date(Date.now() + offsetEndMs).toISOString(),
  totalStock: 100,
});

describe('getSaleStatus', () => {
  it('returns "upcoming" when sale has not started', () => {
    const config = makeConfig(60_000, 3_600_000); // starts in 1 min
    expect(getSaleStatus(config)).toBe('upcoming');
  });

  it('returns "active" when sale is in progress', () => {
    const config = makeConfig(-1_000, 3_600_000); // started 1s ago, ends in 1h
    expect(getSaleStatus(config)).toBe('active');
  });

  it('returns "ended" when sale is past its end time', () => {
    const config = makeConfig(-7_200_000, -3_600_000); // both in the past
    expect(getSaleStatus(config)).toBe('ended');
  });

  it('is "upcoming" at exact start time boundary (ms precision)', () => {
    // Edge: sale starts in exactly 0ms — still upcoming because now < start
    const now = Date.now();
    const config: SaleConfig = {
      startTime: new Date(now + 1).toISOString(),
      endTime: new Date(now + 3_600_000).toISOString(),
      totalStock: 100,
    };
    expect(getSaleStatus(config)).toBe('upcoming');
  });
});
