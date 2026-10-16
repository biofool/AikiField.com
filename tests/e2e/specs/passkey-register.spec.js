// "Register passkey" in the /members More menu (AF #124).
//
// The block used to sit in a second IIFE of coach-chat.js where fetchWithTimeout,
// API, authHeaders and the toast elements do not exist. In any browser with
// WebAuthn, /members threw "ReferenceError: fetchWithTimeout is not defined" at
// load, and the menu item stayed hidden even when the backend flag was on.
// It shipped untested because the stub backend had no /v1/feature-flags.

const { test, expect } = require('@playwright/test');
const { STUB_URL, establishSession, stubRequests, clearStubRequests } = require('../helpers');

async function setFlags(request, flags) {
  const resp = await request.post(`${STUB_URL}/__stub/feature-flags`, { data: { flags } });
  expect(resp.ok()).toBe(true);
}

/** A browser with WebAuthn: PublicKeyCredential exists and credentials.create works. */
async function installFakeWebAuthn(page) {
  await page.addInitScript(() => {
    window.PublicKeyCredential = function PublicKeyCredential() {};
    const bytes = (n) => Uint8Array.from({ length: n }, (_, i) => i + 1).buffer;
    Object.defineProperty(navigator, 'credentials', {
      configurable: true,
      value: {
        create: async (opts) => {
          window.__passkeyCreateOptions = {
            challengeLength: opts.publicKey.challenge.byteLength,
            rpId: opts.publicKey.rp.id,
            userName: opts.publicKey.user.name,
          };
          return {
            id: 'cred-1',
            type: 'public-key',
            response: {
              clientDataJSON: bytes(8),
              attestationObject: bytes(12),
              getTransports: () => ['internal'],
            },
            getClientExtensionResults: () => ({}),
          };
        },
      },
    });
  });
}

function collectPageErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

test.beforeEach(async ({ request }) => {
  await request.post(`${STUB_URL}/__stub/reset`);
  await clearStubRequests(request);
});

test.afterEach(async ({ request }) => {
  await request.post(`${STUB_URL}/__stub/reset`);
});

test('/members loads without a script error in a browser with WebAuthn', async ({ page, request }) => {
  await installFakeWebAuthn(page);
  const errors = collectPageErrors(page);
  await establishSession(page.request);
  await page.goto('/members');
  await expect(page.locator('#coach-logout-bar')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the item stays hidden while the backend flag is off', async ({ page, request }) => {
  await installFakeWebAuthn(page);
  await setFlags(request, { passkey_login: false });
  await establishSession(page.request);
  await page.goto('/members');
  await page.locator('#coach-more-btn').click();
  await expect(page.locator('#coach-passkey-register')).toBeHidden();
});

test('the item stays hidden in a browser without WebAuthn', async ({ page, request }) => {
  await setFlags(request, { passkey_login: true });
  await page.addInitScript(() => { delete window.PublicKeyCredential; });
  await establishSession(page.request);
  await page.goto('/members');
  await page.locator('#coach-more-btn').click();
  await expect(page.locator('#coach-passkey-register')).toBeHidden();
});

test('with the flag on, the item appears and registration posts begin then finish', async ({ page, request }) => {
  await installFakeWebAuthn(page);
  const errors = collectPageErrors(page);
  await setFlags(request, { passkey_login: true });
  await establishSession(page.request);
  await page.goto('/members');
  await page.locator('#coach-more-btn').click();
  const item = page.locator('#coach-passkey-register');
  await expect(item).toBeVisible();
  await item.click();

  await expect(page.locator('#coach-toast-msg')).toContainText(/Passkey registered/i, { timeout: 10_000 });
  const created = await page.evaluate(() => window.__passkeyCreateOptions);
  expect(created.userName).toBe('test@example.com');
  expect(created.challengeLength).toBeGreaterThan(0);

  const log = await stubRequests(request);
  const calls = log.requests
    .filter((r) => r.path.startsWith('/v1/auth/passkey/register/'))
    .map((r) => r.path);
  expect(calls).toEqual(['/v1/auth/passkey/register/begin', '/v1/auth/passkey/register/finish']);
  expect(errors).toEqual([]);
});

test('a cancelled prompt shows a message and does not call finish', async ({ page, request }) => {
  await installFakeWebAuthn(page);
  await page.addInitScript(() => {
    navigator.credentials.create = async () => { const e = new Error('cancelled'); e.name = 'NotAllowedError'; throw e; };
  });
  await setFlags(request, { passkey_login: true });
  await establishSession(page.request);
  await page.goto('/members');
  await page.locator('#coach-more-btn').click();
  await page.locator('#coach-passkey-register').click();
  await expect(page.locator('#coach-toast-msg')).toContainText(/cancelled/i, { timeout: 10_000 });
  const log = await stubRequests(request);
  expect(log.requests.some((r) => r.path === '/v1/auth/passkey/register/finish')).toBe(false);
});
