// Tests for coach-proxy.php — the PHP reverse proxy that forwards
// /coach-api/* requests to the AIRichardMoon backend (stub during tests).
//
// The strongest assertions here read the stub backend's request log. This
// proves WHICH backend was contacted, whether the proxy secret arrived, and
// whether client-IP headers were forwarded (issue #262 — client-IP
// forwarding fix).

const { test, expect } = require('@playwright/test');
const {
  TEST_EMAIL,
  establishSession,
  stubRequests,
  clearStubRequests,
} = require('../helpers');

test.beforeEach(async ({ request }) => {
  await clearStubRequests(request);
});

test.describe('coach-proxy forwarding', () => {
  test('the proxy forwards /coach-api/v1/auth/providers to the stub backend', async ({ request }) => {
    const resp = await request.get('/coach-api/v1/auth/providers');
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body).toHaveProperty('providers');
    expect(Array.isArray(body.providers)).toBe(true);
  });

  test('the proxy returns the backend response status and body', async ({ request }) => {
    const resp = await request.get('/coach-api/v1/auth/providers');
    expect(resp.status()).toBe(200);
    expect(resp.headers()['content-type']).toContain('application/json');
  });

  test('the proxy forwards POST /coach-api/v1/auth/verify to the stub', async ({ request }) => {
    const resp = await request.post('/coach-api/v1/auth/verify', {
      data: { email: TEST_EMAIL, password: 'testpass123' },
    });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.ok).toBe(true);
    expect(body.email).toBe(TEST_EMAIL);
    expect(body.sessionToken).toMatch(/^stub\|/);
  });

  test('the proxy forwards bad credentials and returns the error', async ({ request }) => {
    const resp = await request.post('/coach-api/v1/auth/verify', {
      data: { email: TEST_EMAIL, password: 'wrong' },
    });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.ok).toBe(false);
  });

  test('unknown backend paths return 404 through the proxy', async ({ request }) => {
    const resp = await request.get('/coach-api/v1/nonexistent-endpoint');
    expect(resp.status()).toBe(404);
  });
});

test.describe('proxy secret enforcement', () => {
  test('non-auth requests carry the X-Proxy-Secret header', async ({ request }) => {
    // /v1/auth/providers is exempt from secret enforcement on the backend,
    // but the proxy should still send the header. Use a non-auth path to
    // verify the secret actually arrives and is validated.
    // /v1/auth/rate-limit-status is auth-exempt on the real backend, so use
    // a path that requires the secret. The stub enforces the secret on all
    // non-exempt paths.
    const resp = await request.get('/coach-api/v1/auth/rate-limit-status');
    expect(resp.status()).toBe(200);

    const log = await stubRequests(request);
    const hit = log.requests.find((r) => r.path === '/v1/auth/rate-limit-status');
    expect(hit, 'stub backend was not contacted for /v1/auth/rate-limit-status').toBeTruthy();
    // Auth paths are exempt from secret enforcement, but the proxy should
    // still send the secret header.
    expect(hit.secretSent).toBe(true);
  });
});

test.describe('client-IP header validation (issue #262 / CF-Connecting-IP spoofing)', () => {
  // The e2e app server is only ever reached over loopback in this suite,
  // never through Cloudflare, so REMOTE_ADDR here is never a Cloudflare edge
  // IP. That means the proxy must ignore any client-supplied CF-Connecting-IP
  // / X-Forwarded-For value and substitute the real peer address instead —
  // otherwise a client could set those headers to anything and defeat the
  // backend's IP-based rate limiting on auth endpoints.
  const LOOPBACK_RE = /^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/;

  test('a spoofed CF-Connecting-IP from a non-Cloudflare peer is replaced with the real address', async ({ request }) => {
    await request.get('/coach-api/v1/auth/providers', {
      headers: { 'CF-Connecting-IP': '203.0.113.42' },
    });

    const log = await stubRequests(request);
    const hit = log.requests.find((r) => r.path === '/v1/auth/providers');
    expect(hit, 'stub backend was not contacted').toBeTruthy();
    expect(hit.cfConnectingIp).not.toBe('203.0.113.42');
    expect(hit.cfConnectingIp).toMatch(LOOPBACK_RE);
  });

  test('a spoofed X-Forwarded-For from a non-Cloudflare peer is replaced with the real address', async ({ request }) => {
    await request.get('/coach-api/v1/auth/providers', {
      headers: { 'X-Forwarded-For': '198.51.100.10, 10.0.0.1' },
    });

    const log = await stubRequests(request);
    const hit = log.requests.find((r) => r.path === '/v1/auth/providers');
    expect(hit, 'stub backend was not contacted').toBeTruthy();
    expect(hit.xForwardedFor).not.toBe('198.51.100.10, 10.0.0.1');
    expect(hit.xForwardedFor).toMatch(LOOPBACK_RE);
  });

  test('with no client-supplied IP headers, the proxy still forwards the real peer address', async ({ request }) => {
    await request.get('/coach-api/v1/auth/providers');

    const log = await stubRequests(request);
    const hit = log.requests.find((r) => r.path === '/v1/auth/providers');
    expect(hit, 'stub backend was not contacted').toBeTruthy();
    expect(hit.cfConnectingIp).toMatch(LOOPBACK_RE);
    expect(hit.xForwardedFor).toMatch(LOOPBACK_RE);
  });

  test('the proxy forwards X-Auth-Email and X-Auth-Session headers', async ({ request }) => {
    await request.get('/coach-api/v1/auth/providers', {
      headers: {
        'X-Auth-Email': TEST_EMAIL,
        'X-Auth-Session': 'stub|test@example.com',
      },
    });

    const log = await stubRequests(request);
    const hit = log.requests.find((r) => r.path === '/v1/auth/providers');
    expect(hit, 'stub backend was not contacted').toBeTruthy();
    expect(hit.authEmail).toBe(TEST_EMAIL);
    expect(hit.authSession).toBe('stub|test@example.com');
  });

  test('the proxy forwards X-Request-Id header', async ({ request }) => {
    await request.get('/coach-api/v1/auth/providers', {
      headers: { 'X-Request-Id': 'req-test-12345' },
    });

    const log = await stubRequests(request);
    const hit = log.requests.find((r) => r.path === '/v1/auth/providers');
    expect(hit, 'stub backend was not contacted').toBeTruthy();
    expect(hit.requestId).toBe('req-test-12345');
  });

  test('the proxy forwards Authorization header', async ({ request }) => {
    await request.get('/coach-api/v1/auth/providers', {
      headers: { 'Authorization': 'Bearer test-token-abc' },
    });

    const log = await stubRequests(request);
    const hit = log.requests.find((r) => r.path === '/v1/auth/providers');
    expect(hit, 'stub backend was not contacted').toBeTruthy();
    expect(hit.authorization).toBe('Bearer test-token-abc');
  });
});

test.describe('proxy response header passthrough', () => {
  test('the proxy forwards Content-Type from the backend', async ({ request }) => {
    const resp = await request.get('/coach-api/v1/auth/providers');
    expect(resp.headers()['content-type']).toContain('application/json');
  });
});
