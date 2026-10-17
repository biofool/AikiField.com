// The public mail forms (AF #125): contact-handler.php and
// studio-review-handler.php.
//
// PHP's mail() is pointed at tests/e2e/capture-sendmail.sh (see
// playwright.config.js), which writes each message to .mail-capture/. The
// specs read the real headers back, so they prove what lands in the owner's
// inbox, not what the handler meant to send.

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const E2E_DIR = path.resolve(__dirname, '..');
const MAIL_DIR = path.join(E2E_DIR, '.mail-capture');
const RATE_DIR = path.resolve(E2E_DIR, '..', '..', 'data', 'ratelimit');

const HANDLERS = [
  {
    label: 'contact-handler.php',
    url: '/contact-handler.php',
    okLocation: /^contact\.html\?status=success$/,
    errLocation: /^contact\.html\?status=error&msg=/,
    fields: (over = {}) => ({
      name: 'Pat Visitor', email: 'pat@example.org', organization: 'Acme',
      interest: 'Fractional CISO', message: 'Hello there', ...over,
    }),
    subjectField: 'interest',
  },
  {
    label: 'studio-review-handler.php',
    url: '/studio-review-handler.php',
    okLocation: /^\/somatic-studios\/thanks\.html$/,
    errLocation: /^\/somatic-studios\/index\.html\?status=error&msg=/,
    fields: (over = {}) => ({
      name: 'Pat Visitor', email: 'pat@example.org', studio: 'Zen Studio',
      website: 'https://example.org', location: 'Austin', practice: 'Yoga',
      help: 'Visibility', message: 'Hello there', consent_listing: 'yes', ...over,
    }),
    subjectField: 'studio',
  },
];

/** Every message the capture script has written, parsed into headers and body. */
function capturedMail() {
  if (!fs.existsSync(MAIL_DIR)) return [];
  return fs.readdirSync(MAIL_DIR).sort().map((file) => {
    const raw = fs.readFileSync(path.join(MAIL_DIR, file), 'utf8');
    const [head, ...rest] = raw.split(/\r?\n\r?\n/);
    const headers = {};
    for (const line of head.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
      const i = line.indexOf(':');
      if (i < 0) continue;
      (headers[line.slice(0, i).toLowerCase()] ||= []).push(line.slice(i + 1).trim());
    }
    return { headers, body: rest.join('\n\n'), raw };
  });
}

/** RFC 2047 "B" encoded words -> text (adjacent words are joined). */
function decodeMimeHeader(value) {
  return value
    .replace(/(\?=)\s+(=\?)/g, '$1$2')
    .replace(/=\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=/gi, (_, b64) => Buffer.from(b64, 'base64').toString('utf8'));
}

test.beforeEach(() => {
  fs.rmSync(MAIL_DIR, { recursive: true, force: true });
  // The handlers allow 5 posts per 10 minutes per address; start every test clean.
  if (fs.existsSync(RATE_DIR)) {
    for (const f of fs.readdirSync(RATE_DIR)) {
      if (f.endsWith('.json')) fs.rmSync(path.join(RATE_DIR, f));
    }
  }
});

for (const h of HANDLERS) {
  test.describe(h.label, () => {
    const post = (request, fields) => request.post(h.url, { form: fields, maxRedirects: 0 });

    test('a normal submission is sent and redirects to the success page', async ({ request }) => {
      const resp = await post(request, h.fields());
      expect(resp.status()).toBe(302);
      expect(resp.headers()['location']).toMatch(h.okLocation);
      expect(capturedMail()).toHaveLength(1);
    });

    test('Reply-To carries one bare address, never the typed name', async ({ request }) => {
      const resp = await post(request, h.fields({
        name: 'Kenneth <ceo@aikifield.com>, Mallory',
        email: 'mallory@evil.example',
      }));
      expect(resp.status()).toBe(302);
      const [mail] = capturedMail();
      expect(mail.headers['reply-to']).toEqual(['mallory@evil.example']);
      expect(mail.raw.split(/\r?\n\r?\n/)[0]).not.toContain('ceo@aikifield.com');
      // The typed name is still shown to the owner, in the body.
      expect(mail.body).toContain('Kenneth');
    });

    test('CR/LF in a field cannot add a header', async ({ request }) => {
      const resp = await post(request, h.fields({ name: 'Mallory\r\nBcc: victim@example.com' }));
      expect(resp.status()).toBe(302);
      const [mail] = capturedMail();
      expect(mail.headers['bcc']).toBeUndefined();
    });

    test('a NUL byte is refused with 400 and nothing is sent', async ({ request }) => {
      const resp = await post(request, h.fields({ name: 'Pat\0Visitor' }));
      expect(resp.status()).toBe(400);
      expect(capturedMail()).toHaveLength(0);
    });

    test(`a NUL byte in ${h.subjectField} (it goes into the Subject) is refused with 400`, async ({ request }) => {
      const resp = await post(request, h.fields({ [h.subjectField]: 'Fractional\0CISO' }));
      expect(resp.status()).toBe(400);
      expect(capturedMail()).toHaveLength(0);
    });

    test('an array where a string is expected is a validation error, not an HTTP 500', async ({ request }) => {
      const fields = h.fields();
      delete fields.name;
      fields['name[]'] = 'x';
      const resp = await request.post(h.url, { form: fields, maxRedirects: 0 });
      expect(resp.status()).toBe(302);
      expect(resp.headers()['location']).toMatch(h.errLocation);
      expect(capturedMail()).toHaveLength(0);
    });

    test(`a non-ASCII ${h.subjectField} gives an RFC 2047 Subject that decodes to the original`, async ({ request }) => {
      const resp = await post(request, h.fields({ [h.subjectField]: 'Zen Dōjō 道場' }));
      expect(resp.status()).toBe(302);
      const [mail] = capturedMail();
      const subject = mail.headers['subject'][0];
      expect(subject).toMatch(/^[\x20-\x7e]*$/); // 7-bit only
      expect(decodeMimeHeader(subject)).toContain('Zen Dōjō 道場');
      expect(mail.headers['mime-version']).toEqual(['1.0']);
      expect(mail.headers['content-type'][0]).toMatch(/charset=UTF-8/i);
    });

    test('a name over the limit is refused with a message and nothing is sent', async ({ request }) => {
      const resp = await post(request, h.fields({ name: 'N'.repeat(101) }));
      expect(resp.status()).toBe(302);
      const location = resp.headers()['location'];
      expect(location).toMatch(h.errLocation);
      expect(decodeURIComponent(location.replace(/\+/g, ' '))).toMatch(/Name is too long/);
      expect(capturedMail()).toHaveLength(0);
    });

    test('a message of exactly 5000 characters passes, 5001 is refused', async ({ request }) => {
      const ok = await post(request, h.fields({ message: 'm'.repeat(5000) }));
      expect(ok.headers()['location']).toMatch(h.okLocation);
      const tooLong = await post(request, h.fields({ message: 'm'.repeat(5001) }));
      expect(tooLong.headers()['location']).toMatch(h.errLocation);
      expect(capturedMail()).toHaveLength(1);
    });

    test('multi-line messages keep their line breaks', async ({ request }) => {
      const resp = await post(request, h.fields({ message: 'line one\r\nline two' }));
      expect(resp.status()).toBe(302);
      const [mail] = capturedMail();
      expect(mail.body).toMatch(/line one\r?\nline two/);
    });
  });
}
