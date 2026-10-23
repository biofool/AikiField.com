// "Register passkey" in the /members More menu — issue #124.
//
// The passkey block in coach-chat.js shipped inside the second IIFE
// (initCoachUIEnhancements) where API / fetchWithTimeout / authHeaders and
// the toast elements are out of scope — /members threw
// "ReferenceError: fetchWithTimeout is not defined" and the menu item never
// appeared. These tests would have failed on the old code twice over: the
// pageerror listener catches the uncaught ReferenceError, and the button
// never un-hides.
//
// NOTE: PublicKeyCredential is a SecureContext API and the e2e site runs on
// http://0.0.0.0, so window.PublicKeyCredential is undefined here (which is
// also how the bug shipped untested — the guard was false in every browser
// the suite drives). fakeWebAuthn() polyfills just enough surface for the
// passkey block's guards and its navigator.credentials.create call.

const { test, expect } = require('@playwright/test');
const { establishSession, stubToken, stubRequests, clearStubRequests, TEST_EMAIL, STUB_URL } = require('../helpers');

// The stub's feature flags default to empty (all off) so the login page's
// passkey button stays hidden for every other spec (visual baselines!).
// This spec turns passkey_login on explicitly and resets it afterwards.
test.beforeEach(async ({ request }) => {
  await request.delete(`${STUB_URL}/__stub/feature-flags`);
  await clearStubRequests(request);
});
test.afterEach(async ({ request }) => {
  await request.delete(`${STUB_URL}/__stub/feature-flags`);
});

// A failed feature-flags fetch or an uncaught ReferenceError must not be
// mistaken for "flag off": collect every uncaught page error and fail on it.
function watchPageErrors(page) {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

// Polyfill window.PublicKeyCredential (SecureContext-only, missing on the
// http://0.0.0.0 e2e origin) and a fake navigator.credentials.create that
// resolves with the shape a real authenticator returns.
async function fakeWebAuthn(page) {
  await page.addInitScript(() => {
    window.PublicKeyCredential = window.PublicKeyCredential || function PublicKeyCredential() {};
    if (!navigator.credentials) {
      Object.defineProperty(navigator, 'credentials', { value: {}, configurable: true });
    }
    navigator.credentials.create = async () => ({
      id: 'stub-cred-id',
      rawId: 'stub-cred-id',
      type: 'public-key',
      response: {
        clientDataJSON: new Uint8Array([1, 2, 3]).buffer,
        attestationObject: new Uint8Array([4, 5, 6]).buffer,
        getTransports: () => ['internal'],
      },
      getClientExtensionResults: () => ({}),
    });
  });
}

test.describe('/members Register passkey (issue #124)', () => {
  test('flag off: menu item stays hidden and /members throws no page error', async ({ page }) => {
    const errors = watchPageErrors(page);
    await fakeWebAuthn(page);
    expect((await establishSession(page.request)).body.ok).toBe(true);
    await page.goto('/members');
    // Give the feature-flags fetch a beat to settle.
    await expect(page.locator('#coach-chat-form')).toBeVisible();
    await expect(page.locator('#coach-passkey-register')).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('flag on: item appears and the register flow posts begin then finish', async ({ page }) => {
    const errors = watchPageErrors(page);
    await fakeWebAuthn(page);
    await page.request.post(`${STUB_URL}/__stub/feature-flags`, {
      data: { passkey_login: true },
    });
    expect((await establishSession(page.request)).body.ok).toBe(true);
    await page.goto('/members');
    await expect(page.locator('#coach-chat-form')).toBeVisible();

    // The item un-hides once /v1/feature-flags resolves — but it lives in
    // the More menu, so open the menu to make it visible/clickable.
    await page.locator('#coach-more-btn').click();
    const regBtn = page.locator('#coach-passkey-register');
    await expect(regBtn).toBeVisible();
    await regBtn.click();

    // Success toast via the reused chat toast.
    await expect(page.locator('#coach-toast-msg')).toHaveText(
      'Passkey registered. You can sign in with it next time.'
    );

    // The flow hit the stub backend in order: begin then finish, both
    // authenticated as the signed-in member.
    const { requests } = await stubRequests(page.request);
    const passkeyCalls = requests.filter((r) => r.path.startsWith('/v1/auth/passkey/register/'));
    expect(passkeyCalls.map((r) => r.path)).toEqual([
      '/v1/auth/passkey/register/begin',
      '/v1/auth/passkey/register/finish',
    ]);
    for (const call of passkeyCalls) {
      expect(call.method).toBe('POST');
      expect(call.authEmail).toBe(TEST_EMAIL);
      expect(call.authSession).toBe(stubToken(TEST_EMAIL));
    }

    expect(errors).toEqual([]);
  });
});
