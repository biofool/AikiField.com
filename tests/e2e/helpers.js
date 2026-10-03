// Shared fixtures and helpers for the AikiField e2e suite.
//
// Modeled on the quantumaikido.com/web/tests/e2e/helpers.js pattern but
// simplified for AikiField's single-environment beta-gating auth flow.

const STUB_PORT = Number(process.env.AF_E2E_STUB_PORT || 8201);
const APP_PORT = Number(process.env.AF_E2E_APP_PORT || 8200);

const BASE_URL = `http://0.0.0.0:${APP_PORT}`;
const STUB_URL = `http://0.0.0.0:${STUB_PORT}`;

const TEST_EMAIL = 'test@example.com';
const ADMIN_EMAIL = 'admin@example.com';
const PASSWORD = 'testpass123';

/** The session token minted by stub-backend.php for an email. */
function stubToken(email) {
  return `stub|${email}`;
}

/**
 * Establish a real PHP session by posting to login.php exactly as
 * coach-login.js does after a successful backend auth. Returns login.php's
 * JSON body ({ ok }) so a caller can assert the session was actually created.
 *
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {{email?: string}} opts
 */
async function establishSession(request, { email = TEST_EMAIL } = {}) {
  const resp = await request.post('/login.php', {
    form: {
      action: 'backend-login',
      email,
      sessionToken: stubToken(email),
    },
  });
  return { status: resp.status(), body: await resp.json() };
}

/** Read the stub backend's request log (which backend was hit, with what headers). */
async function stubRequests(request) {
  const resp = await request.get(`${STUB_URL}/__stub/requests`);
  return resp.json();
}

/** Clear the stub request log so a test can assert on its own traffic only. */
async function clearStubRequests(request) {
  await request.delete(`${STUB_URL}/__stub/requests`);
}

/**
 * Sign in through the browser UI, the way a user does: fill the form on
 * /login.php, submit, and wait for coach-login.js to establish the server-side
 * session and navigate. Returns the URL path the browser ended up on.
 */
async function browserLogin(page, { email = TEST_EMAIL, password = PASSWORD, next = null } = {}) {
  const url = next ? `/login.php?next=${encodeURIComponent(next)}` : '/login.php';
  await page.goto(url);
  await page.fill('#coach-email', email);
  await page.fill('#coach-password', password);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.endsWith('/login.php'), { timeout: 15_000 }),
    page.click('#coach-login-btn'),
  ]);
  return new URL(page.url()).pathname;
}

/**
 * Reset the stub backend's /v1/game-results/sync store (and its "endpoint
 * missing" switch) so a test starts from empty accounts on a deployed backend.
 */
async function resetStubGameResults(request) {
  await request.delete(`${STUB_URL}/__stub/game-results`);
}

/** Make the stub answer /v1/game-results/sync with 404, like a backend that predates it. */
async function stubGameResultsMissing(request, missing = true) {
  await request.post(`${STUB_URL}/__stub/game-results/missing`, { data: { missing } });
}

/** The last body AikiField forwarded to the stub's /v1/game-results/sync. */
async function stubGameResultsLastRequest(request) {
  return (await (await request.get(`${STUB_URL}/__stub/game-results/last-request`)).json()).body;
}

module.exports = {
  stubGameResultsLastRequest,
  resetStubGameResults,
  stubGameResultsMissing,
  BASE_URL,
  STUB_URL,
  TEST_EMAIL,
  ADMIN_EMAIL,
  PASSWORD,
  stubToken,
  establishSession,
  stubRequests,
  clearStubRequests,
  browserLogin,
};
