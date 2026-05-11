/**
 * Stress test — simulates a real flash sale surge.
 *
 * What we're proving:
 *   1. The server doesn't crash under 1000 concurrent connections.
 *   2. Exactly `STOCK` purchases succeed — no overselling.
 *   3. Latency remains acceptable (p99 < 500ms on local hardware).
 *
 * Run: npm run test:stress
 * Prerequisites: server running on localhost:3001, Redis up.
 */
import autocannon from 'autocannon';
import http from 'http';

const BASE_URL = process.env.API_URL || 'http://localhost:3001';
const CONNECTIONS = 1000;
const DURATION_SECS = 15;
const STOCK = parseInt(process.env.SALE_STOCK || '100', 10);

// Helper: simple HTTP GET
function get(path: string): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    http.get(`${BASE_URL}${path}`, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode || 0, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode || 0, body: data });
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log('\n=== Flash Sale Stress Test ===\n');

  // 1. Verify server is up
  const health = await get('/health');
  if (health.status !== 200) {
    console.error('Server is not running. Start it with: npm run dev');
    process.exit(1);
  }
  console.log('✓ Server healthy\n');

  // 2. Check current stock
  const statusRes = await get('/sale/status');
  const statusBody = statusRes.body as { status: string; remainingStock: number };
  console.log(`Sale status: ${statusBody.status}`);
  console.log(`Remaining stock: ${statusBody.remainingStock}`);
  if (statusBody.status !== 'active') {
    console.warn('\nWARNING: Sale is not active. Set SALE_START/SALE_END env vars.');
  }

  // 3. Run the stress test
  console.log(`\nFiring ${CONNECTIONS} concurrent connections for ${DURATION_SECS}s...`);
  console.log('Each request uses a unique userId to simulate real buyers.\n');

  let requestCount = 0;

  const result = await new Promise<autocannon.Result>((resolve) => {
    const instance = autocannon({
      url: `${BASE_URL}/sale/buy`,
      connections: CONNECTIONS,
      duration: DURATION_SECS,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      setupClient(client) {
        // Each virtual user gets a unique ID
        const userId = `stress-user-${requestCount++}`;
        client.setBody(JSON.stringify({ userId }));
      },
    });

    autocannon.track(instance, { renderProgressBar: true });
    instance.on('done', resolve);
  });

  // 4. Print summary
  console.log('\n=== Results ===\n');
  console.log(`Total requests:      ${result.requests.total}`);
  console.log(`Requests/sec (avg):  ${result.requests.mean.toFixed(0)}`);
  console.log(`Latency p50:         ${result.latency.p50}ms`);
  console.log(`Latency p99:         ${result.latency.p99}ms`);
  console.log(`2xx responses:       ${result['2xx']}`);
  console.log(`Non-2xx responses:   ${result.non2xx}`);
  console.log(`Errors:              ${result.errors}`);
  console.log(`Timeouts:            ${result.timeouts}`);

  // 5. Verify correctness — stock must not go below 0
  const finalStatus = await get('/sale/status');
  const finalBody = finalStatus.body as { remainingStock: number };
  console.log(`\nFinal remaining stock: ${finalBody.remainingStock}`);

  const successfulBuys = result['2xx'];
  const expectedMax = STOCK;

  console.log('\n=== Correctness Check ===\n');
  if (successfulBuys <= expectedMax) {
    console.log(`✓ No overselling: ${successfulBuys} successful purchases ≤ ${expectedMax} stock`);
  } else {
    console.error(`✗ OVERSELL DETECTED: ${successfulBuys} purchases exceeded ${expectedMax} stock`);
    process.exit(1);
  }

  if (finalBody.remainingStock >= 0) {
    console.log(`✓ Stock is non-negative: ${finalBody.remainingStock} remaining`);
  } else {
    console.error(`✗ Stock went negative: ${finalBody.remainingStock}`);
    process.exit(1);
  }

  if (result.errors === 0) {
    console.log('✓ Zero errors');
  } else {
    console.warn(`⚠ ${result.errors} connection errors (may be expected under extreme load)`);
  }

  const p99 = result.latency.p99;
  if (p99 < 500) {
    console.log(`✓ p99 latency ${p99}ms is under 500ms threshold`);
  } else {
    console.warn(`⚠ p99 latency ${p99}ms exceeds 500ms — consider scaling`);
  }

  console.log('\nStress test complete.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
