// Unified login JS — AikiField projects.php (ported from quantumaikido.com
// login.php, issue #51). Identical behaviour; AikiField renders the login form
// inline at the top of the Sponsored Projects page instead of a standalone
// login.php, and posts the backend-login to window.location.pathname
// (projects.php) to establish the PHP session.
// Handles: login (email+password), registration (email+password+invitation code),
// email confirmation link, password reset link, Google OAuth, forgot-password.
//
// On successful auth, posts the session to projects.php (which stores it in the
// PHP session cookie) and redirects to window.COACH_LOGIN_REDIRECT.
//
// This file consolidates the login logic from coach-auth.js and coach-auth-social.js.

(function() {
    "use strict";

    const API = window.COACH_API_BASE || "/coach-api";
    const FORCE_STAGING = window.COACH_FORCE_STAGING === true;

    function containsBackslash(s) {
        for (let i = 0; i < 4; i++) {
            if (s.includes('\\')) return true;
            if (s.toLowerCase().includes('%5c')) return true;
            try {
                const next = decodeURIComponent(s);
                if (next === s) break;
                s = next;
            } catch { break; }
        }
        return false;
    }

    // Prefer ?redirect= over the baked COACH_LOGIN_REDIRECT (same open-redirect
    // rules as QA's qa_safe_redirect). Needed when login HTML is static/pre-rendered.
    function safeRedirect(candidate, fallback) {
        if (!candidate || typeof candidate !== "string") return fallback;
        const c = candidate.trim();
        if (!c || c[0] !== "/" || c.startsWith("//") || c.includes("\r") || c.includes("\n") || containsBackslash(c)) {
            return fallback;
        }
        try {
            const u = new URL(c, window.location.origin);
            if (u.origin !== window.location.origin) return fallback;
            const path = (u.pathname || "/").replace(/\/+$/, "") || "/";
            if (path === "/login" || path.endsWith("/login")
                || path.endsWith("/login.php") || path.endsWith("/login.html")) {
                return fallback;
            }
            return c;
        } catch (_) {
            return fallback;
        }
    }
    const _initParams = new URLSearchParams(window.location.search);
    const REDIRECT = safeRedirect(
        _initParams.get("redirect"),
        window.COACH_LOGIN_REDIRECT || "/members.php",
    );
    let currentEmail = "";
    let pendingValidationEmail = "";

    // --- DOM refs ---
    const loginStep      = document.getElementById("coach-login");
    const registerStep   = document.getElementById("coach-register");
    const resetStep      = document.getElementById("coach-reset-step");
    const confirmStep    = document.getElementById("coach-confirm-step");

    // Login form
    const loginForm      = document.getElementById("coach-login-form");
    const emailInput     = document.getElementById("coach-email");
    const passwordInput  = document.getElementById("coach-password");
    const loginBtn       = document.getElementById("coach-login-btn");
    const loginStatus    = document.getElementById("coach-login-status");
    const forgotBtn      = document.getElementById("coach-forgot-btn");
    const toggleBtn      = document.getElementById("coach-toggle-btn");
    const toggleBackBtn  = document.getElementById("coach-toggle-back-btn");

    // Register form
    const registerForm   = document.getElementById("coach-register-form");
    const regEmailInput  = document.getElementById("coach-reg-email");
    const regSendCodeBtn = document.getElementById("coach-reg-send-code-btn");
    const regEmailStatus = document.getElementById("coach-reg-email-status");
    const regValidationCodeInput = document.getElementById("coach-reg-validation-code");
    const regPasswordInput = document.getElementById("coach-reg-password");
    const regCodeInput   = document.getElementById("coach-reg-code");
    const regAliasInput  = document.getElementById("coach-reg-alias");
    const registerBtn    = document.getElementById("coach-register-btn");
    const registerStatus = document.getElementById("coach-register-status");
    const regValidationSummary = document.getElementById("coach-reg-validation-summary");

    // Login-time activation form (shown when login returns needsValidation)
    const loginValidationContainer = document.getElementById("coach-login-validation");
    const loginValidationCodeInput = document.getElementById("coach-login-validation-code");
    const loginResendCodeBtn = document.getElementById("coach-login-resend-code-btn");

    // Reset form
    const resetForm      = document.getElementById("coach-reset-form");
    const resetPasswordInput = document.getElementById("coach-reset-password");
    const resetBtn       = document.getElementById("coach-reset-btn");
    const resetStatus    = document.getElementById("coach-reset-status");

    // Confirm
    const confirmText    = document.getElementById("coach-confirm-text");
    const confirmStatus  = document.getElementById("coach-confirm-status");

    const socialDiv      = document.getElementById("coach-social");
    const divider        = document.getElementById("coach-divider");

    // Captcha
    const forgotCaptcha  = document.getElementById("coach-forgot-captcha");
    const loginCaptcha   = document.getElementById("coach-login-captcha");

    // --- Helpers ---
    function showStatus(el, msg, type) {
        el.hidden = false;
        el.className = "coach-status status-" + type;
        el.textContent = msg;
    }

    // Resend cooldown (ticket #510): after any send, disable the button for
    // COOLDOWN_SECONDS with a visible countdown. Prevents rapid-fire code
    // generation that floods the user's inbox. The backend keeps up to 2
    // concurrent codes valid, so this is a UX guard, not a correctness one.
    const RESEND_COOLDOWN_SECONDS = 60;
    let _cooldownTimers = {};
    function startResendCooldown(btn, seconds) {
        const secs = seconds || RESEND_COOLDOWN_SECONDS;
        const originalText = btn.dataset.originalText || btn.textContent;
        btn.dataset.originalText = originalText;
        let remaining = secs;
        btn.disabled = true;
        btn.textContent = "Resend code (" + remaining + "s)";
        if (_cooldownTimers[btn.id]) clearInterval(_cooldownTimers[btn.id]);
        _cooldownTimers[btn.id] = setInterval(() => {
            remaining--;
            if (remaining <= 0) {
                clearInterval(_cooldownTimers[btn.id]);
                delete _cooldownTimers[btn.id];
                btn.disabled = false;
                btn.textContent = originalText;
            } else {
                btn.textContent = "Resend code (" + remaining + "s)";
            }
        }, 1000);
    }
    function isOnCooldown(btn) {
        return btn.disabled && _cooldownTimers[btn.id] != null;
    }

    // --- Field validation ------------------------------------------------
    // These forms carry `novalidate`, so the browser never blocks submit on
    // its own. That is deliberate: native constraint validation rejects a
    // field with only a small tooltip, which reads as the button doing
    // nothing at all. Every rejection below produces a visible status line.
    //
    // The backend requires 12-128 characters when a password is *set*
    // (register / reset / change) — AIRichardMoon `backend/app/auth.py`.
    // Signing in has NO length rule there, so an existing shorter password
    // must still be accepted; the sign-in form only checks for emptiness.
    const PASSWORD_MIN = 12;
    const PASSWORD_MAX = 128;
    const ALIAS_MAX = 40;

    function newPasswordProblem(pw) {
        if (!pw) return "Choose a password.";
        if (pw.length < PASSWORD_MIN) {
            return "Password must be at least " + PASSWORD_MIN
                + " characters — yours is " + pw.length + ".";
        }
        if (pw.length > PASSWORD_MAX) {
            return "Password must be " + PASSWORD_MAX
                + " characters or fewer — yours is " + pw.length + ".";
        }
        return null;
    }

    function emailProblem(value) {
        if (!value) return "Enter your email address.";
        const at = value.indexOf("@");
        if (at < 1 || at === value.length - 1 || /\s/.test(value)) {
            return "Enter a valid email address.";
        }
        return null;
    }

    // Fetch with timeout and bounded retry/backoff (issue #17).
    async function fetchWithTimeout(url, opts, { timeoutMs = 15000, retries = 2, baseDelayMs = 500 } = {}) {
        let lastErr;
        for (let attempt = 0; attempt <= retries; attempt++) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            try {
                const resp = await fetch(url, { ...opts, signal: controller.signal });
                clearTimeout(timer);
                if (resp.status >= 500 && attempt < retries) {
                    const delay = baseDelayMs * Math.pow(2, attempt);
                    await new Promise(r => setTimeout(r, delay));
                    continue;
                }
                return resp;
            } catch (err) {
                clearTimeout(timer);
                lastErr = err;
                if (attempt < retries) {
                    const delay = baseDelayMs * Math.pow(2, attempt);
                    await new Promise(r => setTimeout(r, delay));
                    continue;
                }
            }
        }
        throw lastErr || new Error("Request failed after retries");
    }

    function httpErrorMessage(status, fallback) {
        if (status === 401) return "Invalid email or password.";
        if (status === 403) return "You don't have permission to do that.";
        if (status === 429) return "Too many attempts. Please wait a moment and try again.";
        if (status >= 500) return "The service is temporarily unavailable. Please try again in a moment.";
        return fallback || "Something went wrong. Please try again.";
    }

    function showStep(step) {
        loginStep.hidden    = (step !== "login");
        registerStep.hidden = (step !== "register");
        resetStep.hidden    = (step !== "reset");
        confirmStep.hidden  = (step !== "confirm");
    }

    // --- Establish server-side session ---
    // Posts email + sessionToken to login.php, which stores them in the PHP
    // session cookie. Then redirects to the destination.
    async function establishServerSession(email, sessionToken, statusEl) {
        // login.php always replies 200 with {"ok":true|false} — false when the
        // backend check-session call failed or was rejected (its curl timeout
        // is 10s, which a cold Cloud Run start can exceed). The status code
        // alone therefore says nothing; the body has to be read.
        let established = false;
        try {
            const resp = await fetchWithTimeout(window.location.pathname, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: "action=backend-login&email=" + encodeURIComponent(email)
                    + "&sessionToken=" + encodeURIComponent(sessionToken),
            });
            const data = resp.ok ? await resp.json().catch(() => null) : null;
            established = !!(data && data.ok);
            if (!established) {
                console.error(
                    "establishServerSession: server session not created (status "
                    + resp.status + ", ok=" + (data && data.ok) + ")");
            }
        } catch (err) {
            console.error("establishServerSession: request failed", err);
            // If the server-side session POST fails, the httpOnly PHP session
            // cookie won't be set, so we must NOT redirect — that is handled
            // below. There is no sessionStorage fallback on AikiField: the
            // inline AI Chat that used to read qa_session_token from
            // sessionStorage has been removed from this site, so persisting
            // the raw bearer token client-side (readable by any script in
            // this origin, including future XSS) has no functional benefit
            // here — see AGENTS.md and projects.php's header comment.
        }

        if (!established) {
            // Redirecting without the session cookie bounces the user straight
            // back to login with nothing shown — the silent-login failure.
            // Surface it instead of navigating away.
            const el = statusEl || loginStatus;
            if (el) {
                showStatus(el,
                    "Signed in, but the session could not be established. "
                    + "Please try again in a moment.", "error");
            }
            return false;
        }

        // Redirect to destination
        window.location.href = REDIRECT;
        return true;
    }

    // --- Turnstile captcha helpers ---
    function getCaptchaToken() {
        if (forgotCaptcha && !forgotCaptcha.hidden) {
            return (window.qaTurnstileTokens && window.qaTurnstileTokens.forgot) || "";
        }
        if (loginStep && !loginStep.hidden) {
            return (window.qaTurnstileTokens && window.qaTurnstileTokens.login) || "";
        }
        return (window.qaTurnstileTokens && window.qaTurnstileTokens.reg) || "";
    }

    function resetCaptchaToken(which) {
        if (window.qaTurnstileTokens) { window.qaTurnstileTokens[which] = ""; }
        if (typeof turnstile !== "undefined") {
            try {
                if (which === "login" && loginCaptcha) turnstile.reset(loginCaptcha.querySelector(".cf-turnstile"));
                else if (which === "forgot" && forgotCaptcha) turnstile.reset(forgotCaptcha.querySelector(".cf-turnstile"));
                else turnstile.reset();
            } catch (_) {}
        }
    }

    // --- OAuth callback handling ---
    // One-time code exchange flow (issue #169): exchange OTC for session token.
    async function handleOAuthCallback() {
        const params = new URLSearchParams(window.location.search);
        const oauthCode = params.get("oauth_code");
        if (!oauthCode) return false;
        history.replaceState(null, "", window.location.pathname);
        try {
            const resp = await fetchWithTimeout(API + "/v1/auth/oauth/exchange", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code: oauthCode }),
            });
            const data = await resp.json();
            if (data.ok && data.sessionToken) {
                showStatus(loginStatus, "Signed in! Redirecting...", "success");
                establishServerSession(data.email, data.sessionToken);
                return true;
            }
            showStatus(loginStatus, data.error || "OAuth sign-in failed.", "error");
            return false;
        } catch (error) {
            showStatus(loginStatus, "Network error: " + error.message, "error");
            return false;
        }
    }

    // Gate / OAuth error codes in ?error=. Map known codes to the same copy as
    // login.php; preserve ?redirect= when clearing the error from the URL.
    function loginErrorMessage(code) {
        const email = sessionStorage.getItem("qa_email") || "";
        switch (code) {
            case "admin_required":
                return email
                    ? ("You are signed in as " + email
                        + ", which does not have admin access. Sign out and use an admin account to reach the dashboard.")
                    : "Your account does not have admin access.";
            case "aeo_required":
                return email
                    ? ("You are signed in as " + email
                        + ", which does not have AEO review access. Ask an admin to grant the AEO review flag, or sign in with an admin account.")
                    : "Your account does not have AEO review access.";
            case "session_expired":
                return "Your session has expired. Please sign in again.";
            default:
                try {
                    return decodeURIComponent(code);
                } catch (_) {
                    return code;
                }
        }
    }

    function handleQueryError() {
        const params = new URLSearchParams(window.location.search);
        const error = params.get("error");
        if (!error || !loginStatus) return;
        showStatus(loginStatus, loginErrorMessage(error), "error");
        params.delete("error");
        const qs = params.toString();
        history.replaceState(null, "", window.location.pathname + (qs ? "?" + qs : ""));
    }

    // --- Confirmation link handling (?confirm=token) ---
    async function handleConfirmLink() {
        const params = new URLSearchParams(window.location.search);
        const token = params.get("confirm");
        if (!token) return false;
        showStep("confirm");
        showStatus(confirmStatus, "Confirming...", "loading");
        try {
            const resp = await fetchWithTimeout(API + "/v1/auth/confirm-email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token }),
            });
            const data = await resp.json();
            if (data.ok && data.sessionToken) {
                confirmText.textContent = data.message || "Your email is confirmed!";
                showStatus(confirmStatus, "Redirecting...", "success");
                establishServerSession(data.email, data.sessionToken, confirmStatus);
            } else {
                confirmText.textContent = "";
                showStatus(confirmStatus, data.error || "Confirmation failed.", "error");
            }
        } catch (err) {
            confirmText.textContent = "";
            showStatus(confirmStatus, "Network error: " + err.message, "error");
        }
        history.replaceState(null, "", window.location.pathname);
        return true;
    }

    // --- Password reset link handling (?reset=token) ---
    function handleResetLink() {
        const params = new URLSearchParams(window.location.search);
        const token = params.get("reset");
        if (!token) return false;
        const email = params.get("email");
        showStep("reset");
        resetForm.dataset.token = token;
        if (email) {
            resetForm.dataset.email = email;
            const intro = document.getElementById("coach-reset-intro");
            if (intro) {
                intro.textContent = "Resetting password for " + email + ". Enter your new password below.";
            }
        }
        resetPasswordInput.focus();
        history.replaceState(null, "", window.location.pathname);
        return true;
    }

    // --- Validation link handling (?validate=token&email=email) ---
    // When the user clicks the link in the validation email, verify the token
    // server-side, pre-fill the email field, and mark the email as validated.
    // The user still enters password + invitation code to complete registration.
    let pendingValidationToken = "";

    async function handleValidationLink() {
        const params = new URLSearchParams(window.location.search);
        const token = params.get("validate");
        if (!token) return false;
        const email = params.get("email") || "";
        // Show the registration step
        if (registerStep) registerStep.scrollIntoView({ behavior: "smooth", block: "start" });
        if (regEmailInput && email) regEmailInput.value = email;
        showStatus(regEmailStatus, "Verifying your email link...", "loading");
        try {
            const resp = await fetchWithTimeout(API + "/v1/auth/verify-validation-token", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, token }),
            });
            const data = await resp.json();
            if (data.ok) {
                pendingValidationToken = token;
                lastSentEmail = email;
                showStatus(regEmailStatus, "Your email is verified!", "success");
                // Skip to step 2 (password) since email is already verified
                goToRegStep(2);
                if (regPasswordInput) regPasswordInput.focus();
            } else {
                showStatus(regEmailStatus, data.error || "This validation link is invalid or expired. Please request a new code.", "error");
            }
        } catch (err) {
            showStatus(regEmailStatus, "Network error: " + err.message, "error");
        }
        history.replaceState(null, "", window.location.pathname);
        return true;
    }

    // --- Load OAuth providers ---
    async function loadProviders() {
        try {
            const resp = await fetchWithTimeout(API + "/v1/auth/providers");
            const data = await resp.json();
            if (data.providers && data.providers.length > 0) {
                socialDiv.hidden = false;
                divider.hidden = false;
                for (const p of data.providers) {
                    const btn = document.createElement("button");
                    btn.className = "coach-social-btn";
                    btn.type = "button";
                    btn.dataset.provider = p.id;
                    if (p.icon) {
                        const iconSpan = document.createElement("span");
                        iconSpan.className = "coach-social-icon";
                        iconSpan.innerHTML = p.icon;
                        btn.appendChild(iconSpan);
                    }
                    const label = document.createElement("span");
                    label.textContent = "Continue with " + p.label;
                    btn.appendChild(label);
                    btn.addEventListener("click", () => {
                        window.location.href = API + "/v1/auth/" + p.id + "/authorize";
                    });
                    socialDiv.appendChild(btn);
                }
            }
        } catch (_) { /* hide social if unavailable */ }
    }

    // --- Login form ---
    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = emailInput.value.trim().toLowerCase();
        const password = passwordInput.value;
        // Sign-in deliberately applies no length rule — the backend has none,
        // and accounts predating the 12-character minimum must still work.
        if (!email) {
            showStatus(loginStatus, "Enter your email address or login ID.", "error");
            emailInput.focus();
            return;
        }
        if (!password) {
            showStatus(loginStatus, "Enter your password.", "error");
            passwordInput.focus();
            return;
        }
        currentEmail = email;

        // If the validation code field is visible and filled, call activate
        // instead of verify. This handles the login-time activation flow.
        const validationCode = loginValidationCodeInput && !loginValidationContainer.hidden
            ? loginValidationCodeInput.value.trim()
            : "";
        if (validationCode) {
            loginBtn.disabled = true;
            showStatus(loginStatus, "Activating your account...", "loading");
            try {
                const resp = await fetchWithTimeout(API + "/v1/auth/activate-with-code", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        email,
                        code: validationCode,
                        password,
                        captchaToken: getCaptchaToken(),
                    }),
                });
                const data = await resp.json();
                loginBtn.disabled = false;
                if (data.ok && data.sessionToken) {
                    showStatus(loginStatus, "Account activated! Redirecting...", "success");
                    establishServerSession(data.email || email, data.sessionToken);
                } else {
                    showStatus(loginStatus, data.error || "Activation failed. Please check your code and try again.", "error");
                }
                resetCaptchaToken("login");
            } catch (err) {
                loginBtn.disabled = false;
                const msg = err && err.name === "AbortError"
                    ? "The request timed out. Please try again."
                    : "Network error: " + (err && err.message ? err.message : "unknown");
                showStatus(loginStatus, msg, "error");
            }
            return;
        }

        loginBtn.disabled = true;
        showStatus(loginStatus, "Signing in...", "loading");

        try {
            const resp = await fetchWithTimeout(API + "/v1/auth/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password, captchaToken: getCaptchaToken() }),
            });
            const data = await resp.json();
            loginBtn.disabled = false;

            if (data.ok && data.sessionToken) {
                const authEmail = data.email || email;
                showStatus(loginStatus, "Signed in! Redirecting...", "success");
                establishServerSession(authEmail, data.sessionToken);
            } else if (data.needsValidation) {
                // Account exists but isn't activated. Show the validation code
                // field so the user can enter the code that was just emailed.
                if (loginValidationContainer) {
                    loginValidationContainer.hidden = false;
                    loginValidationCodeInput.focus();
                }
                showStatus(loginStatus, data.error || "A validation code has been sent to your email. Enter it below to complete sign-in.", "info");
                pendingValidationEmail = data.email || email;
            } else if (data.pending) {
                showStatus(loginStatus, data.error || "Your account is pending confirmation.", "error");
            } else {
                showStatus(loginStatus, data.error || httpErrorMessage(resp.status), "error");
            }
            resetCaptchaToken("login");
        } catch (err) {
            loginBtn.disabled = false;
            const msg = err && err.name === "AbortError"
                ? "The request timed out. Please try again."
                : "Network error: " + (err && err.message ? err.message : "unknown");
            showStatus(loginStatus, msg, "error");
        }
    });

    // --- Login-time activation: resend code ---
    if (loginResendCodeBtn) {
        loginResendCodeBtn.addEventListener("click", async () => {
            const email = pendingValidationEmail || emailInput.value.trim().toLowerCase();
            if (!email || !email.includes("@")) {
                showStatus(loginStatus, "Enter your email address first.", "error");
                return;
            }
            if (isOnCooldown(loginResendCodeBtn)) return;
            loginResendCodeBtn.disabled = true;
            showStatus(loginStatus, "Sending validation code...", "loading");
            try {
                const resp = await fetchWithTimeout(API + "/v1/auth/send-validation-code", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, captchaToken: getCaptchaToken() }),
                });
                const data = await resp.json();
                if (data.ok) {
                    showStatus(loginStatus, data.message || "A new validation code has been sent to your email.", "success");
                    startResendCooldown(loginResendCodeBtn);
                } else {
                    loginResendCodeBtn.disabled = false;
                    showStatus(loginStatus, data.error || "Failed to send validation code.", "error");
                }
                resetCaptchaToken("login");
            } catch (err) {
                loginResendCodeBtn.disabled = false;
                showStatus(loginStatus, "Network error: " + (err.message || "please try again."), "error");
            }
        });
    }

    // --- Forgot password ---
    let forgotCaptchaShown = false;

    forgotBtn.addEventListener("click", async () => {
        const email = emailInput.value.trim().toLowerCase();
        if (!email) {
            showStatus(loginStatus, "Enter your email or login ID first.", "info");
            emailInput.focus();
            return;
        }

        if (forgotCaptcha && !forgotCaptchaShown) {
            forgotCaptchaShown = true;
            forgotCaptcha.hidden = false;
            if (loginCaptcha) loginCaptcha.hidden = true;
            showStatus(loginStatus, "Please complete the captcha, then click \"Forgot password?\" again.", "info");
            return;
        }

        const captchaToken = getCaptchaToken();
        if (forgotCaptcha && !captchaToken) {
            showStatus(loginStatus, "Please complete the captcha first.", "error");
            return;
        }

        forgotBtn.disabled = true;
        showStatus(loginStatus, "Sending reset link...", "loading");
        try {
            const resp = await fetchWithTimeout(API + "/v1/auth/request-reset", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, captchaToken }),
            });
            const data = await resp.json();
            forgotBtn.disabled = false;
            if (data.ok) {
                showStatus(loginStatus, data.message || "If an account exists, a reset link has been sent.", "success");
            } else {
                showStatus(loginStatus, data.error || "Failed to send reset link.", "error");
            }
            resetCaptchaToken("forgot");
        } catch (err) {
            forgotBtn.disabled = false;
            showStatus(loginStatus, "Network error: " + err.message, "error");
        }
    });

    // --- Form UI Helpers (Tabs, OTP, Password Reveal) ---
    function initPasswordToggles() {
        document.querySelectorAll(".coach-password-wrap").forEach(wrap => {
            const input = wrap.querySelector("input");
            const toggle = wrap.querySelector(".coach-password-toggle");
            if (!input || !toggle) return;
            const eyeShow = toggle.querySelector(".eye-show");
            const eyeHide = toggle.querySelector(".eye-hide");
            toggle.addEventListener("click", () => {
                const isPassword = input.type === "password";
                input.type = isPassword ? "text" : "password";
                toggle.setAttribute("aria-pressed", isPassword ? "true" : "false");
                toggle.setAttribute("aria-label", isPassword ? "Hide password" : "Show password");
                if (eyeShow) eyeShow.hidden = isPassword;
                if (eyeHide) eyeHide.hidden = !isPassword;
            });
        });
    }

    function initPasswordFeedback() {
        function attach(input, feedbackId) {
            const feedback = document.getElementById(feedbackId);
            if (!input || !feedback) return;
            input.addEventListener("input", () => {
                const len = input.value.length;
                if (len === 0) {
                    feedback.textContent = "Minimum 12 characters. Use a passphrase or password manager.";
                    feedback.style.color = "";
                } else if (len < PASSWORD_MIN) {
                    const diff = PASSWORD_MIN - len;
                    feedback.textContent = diff + " more character" + (diff === 1 ? "" : "s") + " needed (minimum 12).";
                    feedback.style.color = "#d9534f";
                } else if (len > PASSWORD_MAX) {
                    feedback.textContent = "Password exceeds maximum length of " + PASSWORD_MAX + " characters.";
                    feedback.style.color = "#d9534f";
                } else {
                    feedback.textContent = "✓ Password meets length requirements.";
                    feedback.style.color = "#2e7d32";
                }
            });
        }
        attach(regPasswordInput, "coach-reg-password-feedback");
        attach(resetPasswordInput, "coach-reset-password-feedback");
    }

    function initOtpControllers() {
        document.querySelectorAll(".coach-otp-wrapper").forEach(wrapper => {
            const digits = Array.from(wrapper.querySelectorAll(".coach-otp-digit"));
            const hiddenValue = wrapper.querySelector(".coach-otp-value");
            if (!digits.length || !hiddenValue) return;

            function syncValue() {
                const val = digits.map(d => d.value.trim()).join("");
                hiddenValue.value = val;
            }

            digits.forEach((digit, idx) => {
                digit.addEventListener("input", (e) => {
                    const val = digit.value.replace(/\D/g, "");
                    digit.value = val ? val.charAt(val.length - 1) : "";
                    syncValue();
                    if (digit.value && idx < digits.length - 1) {
                        digits[idx + 1].focus();
                        digits[idx + 1].select();
                    }
                });

                digit.addEventListener("keydown", (e) => {
                    if (e.key === "Backspace" && !digit.value && idx > 0) {
                        digits[idx - 1].focus();
                        digits[idx - 1].select();
                    } else if (e.key === "ArrowLeft" && idx > 0) {
                        digits[idx - 1].focus();
                    } else if (e.key === "ArrowRight" && idx < digits.length - 1) {
                        digits[idx + 1].focus();
                    }
                });

                digit.addEventListener("paste", (e) => {
                    e.preventDefault();
                    const text = (e.clipboardData || window.clipboardData).getData("text").replace(/\D/g, "");
                    if (!text) return;
                    for (let i = 0; i < digits.length; i++) {
                        digits[i].value = text.charAt(i) || "";
                    }
                    syncValue();
                    const nextIdx = Math.min(text.length, digits.length - 1);
                    digits[nextIdx].focus();
                });
            });
        });
    }

    function initAuthTabs() {
        const tabLogin = document.getElementById("coach-tab-login");
        const tabRegister = document.getElementById("coach-tab-register");

        function switchTab(target) {
            if (target === "register") {
                showStep("register");
                if (tabRegister) {
                    tabRegister.classList.add("active");
                    tabRegister.setAttribute("aria-selected", "true");
                }
                if (tabLogin) {
                    tabLogin.classList.remove("active");
                    tabLogin.setAttribute("aria-selected", "false");
                }
                regEmailInput.focus();
            } else {
                showStep("login");
                if (tabLogin) {
                    tabLogin.classList.add("active");
                    tabLogin.setAttribute("aria-selected", "true");
                }
                if (tabRegister) {
                    tabRegister.classList.remove("active");
                    tabRegister.setAttribute("aria-selected", "false");
                }
                emailInput.focus();
            }
        }

        if (tabLogin) tabLogin.addEventListener("click", () => switchTab("login"));
        if (tabRegister) tabRegister.addEventListener("click", () => switchTab("register"));
        if (toggleBtn) toggleBtn.addEventListener("click", () => switchTab("register"));
        if (toggleBackBtn) toggleBackBtn.addEventListener("click", () => switchTab("login"));
    }

    // --- Multi-step registration wizard (ticket #510) ---
    // Step 1: Email + validation code (optional)
    // Step 2: Password + alias + language
    // Step 3: Invitation code + submit
    let regCurrentStep = 1;

    function goToRegStep(step) {
        regCurrentStep = step;
        document.querySelectorAll(".coach-reg-step").forEach(el => {
            el.hidden = parseInt(el.dataset.step, 10) !== step;
        });
        document.querySelectorAll(".coach-reg-step-dot").forEach(el => {
            const s = parseInt(el.dataset.step, 10);
            el.classList.toggle("active", s === step);
            el.classList.toggle("done", s < step);
        });
        document.querySelectorAll(".coach-reg-step-label").forEach(el => {
            el.classList.toggle("active", parseInt(el.dataset.step, 10) === step);
        });
        if (step === 3) updateValidationSummary();
        if (registerStep) registerStep.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function updateValidationSummary() {
        if (!regValidationSummary) return;
        const hasCode = regValidationCodeInput && regValidationCodeInput.value.trim();
        const hasToken = !!pendingValidationToken;
        if (hasCode || hasToken) {
            regValidationSummary.className = "coach-reg-validation-summary verified";
            regValidationSummary.textContent = "Email verified — your account will be activated immediately.";
        } else {
            regValidationSummary.className = "coach-reg-validation-summary pending";
            regValidationSummary.textContent = "Email not yet verified — you'll be asked for a validation code at first login.";
        }
    }

    registerForm.addEventListener("click", (e) => {
        if (e.target.matches(".coach-reg-next-btn")) {
            const next = parseInt(e.target.dataset.next, 10);
            if (regCurrentStep === 1) {
                const email = regEmailInput.value.trim().toLowerCase();
                if (!email || !email.includes("@") || email.indexOf("@") === email.length - 1) {
                    showStatus(regEmailStatus, "Please enter a valid email address.", "error");
                    return;
                }
            }
            if (regCurrentStep === 2) {
                const password = regPasswordInput.value;
                const pwProblem = newPasswordProblem(password);
                if (pwProblem) {
                    showStatus(registerStatus, pwProblem, "error");
                    return;
                }
            }
            showStatus(registerStatus, "", "");
            goToRegStep(next);
        }
        if (e.target.matches(".coach-reg-back-btn")) {
            const back = parseInt(e.target.dataset.back, 10);
            showStatus(registerStatus, "", "");
            goToRegStep(back);
        }
    });

    // --- Send email validation code ---
    // Manually via the "Send validation code" button. The backend
    // generates a 6-digit code and emails it. The code must be entered in the
    // validation-code field to complete registration.
    let lastSentEmail = "";

    async function sendRegValidationCode() {
        const email = regEmailInput.value.trim().toLowerCase();
        if (!email || !email.includes("@") || email.indexOf("@") === email.length - 1) {
            showStatus(regEmailStatus, "Please enter a valid email address.", "error");
            return;
        }
        // Don't re-send if the email hasn't changed since the last successful send.
        if (email === lastSentEmail) {
            showStatus(regEmailStatus, "A validation code was already sent to " + email + ". Check your inbox (and spam folder).", "info");
            return;
        }
        if (regSendCodeBtn && isOnCooldown(regSendCodeBtn)) return;
        if (regSendCodeBtn) regSendCodeBtn.disabled = true;
        showStatus(regEmailStatus, "Sending validation code to " + email + "...", "loading");
        try {
            const resp = await fetchWithTimeout(API + "/v1/auth/send-validation-code", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email,
                    captchaToken: getCaptchaToken("reg"),
                }),
            });
            const data = await resp.json();
            if (data.ok) {
                lastSentEmail = email;
                showStatus(regEmailStatus, data.message || "A validation code has been sent to " + email + ". Enter it below to continue.", "success");
                if (regSendCodeBtn) startResendCooldown(regSendCodeBtn);
            } else {
                if (regSendCodeBtn) regSendCodeBtn.disabled = false;
                showStatus(regEmailStatus, data.error || "Failed to send validation code.", "error");
            }
            resetCaptchaToken("reg");
        } catch (err) {
            if (regSendCodeBtn) regSendCodeBtn.disabled = false;
            showStatus(regEmailStatus, friendlyErrorMessage(err), "error");
        }
    }

    // Manual send via button (explicit user action).
    if (regSendCodeBtn) {
        regSendCodeBtn.addEventListener("click", sendRegValidationCode);
    }

    // --- Register form ---
    registerForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = regEmailInput.value.trim().toLowerCase();
        const validationCode = regValidationCodeInput ? regValidationCodeInput.value.trim() : "";
        const password = regPasswordInput.value;
        const invitationCode = regCodeInput ? regCodeInput.value.trim() : "";
        const alias = regAliasInput ? regAliasInput.value.trim() : "";
        const regProblem = emailProblem(email)
            || newPasswordProblem(password)
            || (alias && alias.length > ALIAS_MAX
                ? "Login name must be " + ALIAS_MAX + " characters or fewer — yours is "
                  + alias.length + "." : null)
            || (validationCode && !/^\d{6}$/.test(validationCode)
                ? "The validation code is the 6 digits from your email." : null);
        if (regProblem) {
            showStatus(registerStatus, regProblem, "error");
            return;
        }

        registerBtn.disabled = true;
        showStatus(registerStatus, "Creating your account...", "loading");

        try {
            const body = {
                email,
                password,
                captchaToken: getCaptchaToken("reg"),
            };
            if (invitationCode) body.invitationCode = invitationCode;
            if (validationCode) body.validationCode = validationCode;
            if (pendingValidationToken) body.validationToken = pendingValidationToken;
            if (alias) body.alias = alias;
            const resp = await fetchWithTimeout(API + "/v1/auth/register-with-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await resp.json();
            registerBtn.disabled = false;

            if (data.ok) {
                if (data.active && data.sessionToken) {
                    showStatus(registerStatus, data.message || "Account created! Signing you in...", "success");
                    establishServerSession(data.email || email, data.sessionToken, registerStatus);
                } else if (data.pending || data.active === false) {
                    showStatus(registerStatus, data.message || "Account created. Your email is verified, and your account is pending administrator approval before you can sign in.", "info");
                    registerForm.reset();
                } else {
                    showStatus(registerStatus, data.message || "Check your email for a confirmation link.", "success");
                    registerForm.reset();
                }
            } else {
                showStatus(registerStatus, data.error || "Registration failed.", "error");
            }
            resetCaptchaToken("reg");
        } catch (err) {
            registerBtn.disabled = false;
            showStatus(registerStatus, friendlyErrorMessage(err), "error");
        }
    });

    // --- Reset password form ---
    resetForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const token = resetForm.dataset.token;
        const newPassword = resetPasswordInput.value;
        if (!token) {
            showStatus(resetStatus,
                "This reset link is invalid or has expired. Request a new one.", "error");
            return;
        }
        const resetProblem = newPasswordProblem(newPassword);
        if (resetProblem) {
            showStatus(resetStatus, resetProblem, "error");
            resetPasswordInput.focus();
            return;
        }

        resetBtn.disabled = true;
        showStatus(resetStatus, "Resetting password...", "loading");

        try {
            const resp = await fetchWithTimeout(API + "/v1/auth/reset-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token, newPassword }),
            });
            const data = await resp.json();
            resetBtn.disabled = false;

            if (data.ok && data.sessionToken) {
                showStatus(resetStatus, data.message || "Password reset. Redirecting...", "success");
                establishServerSession(data.email, data.sessionToken, resetStatus);
            } else {
                showStatus(resetStatus, data.error || "Reset failed.", "error");
            }
        } catch (err) {
            resetBtn.disabled = false;
            showStatus(resetStatus, friendlyErrorMessage(err), "error");
        }
    });

    // --- Init ---
    initPasswordToggles();
    initPasswordFeedback();
    initOtpControllers();
    initAuthTabs();

    // handleOAuthCallback is async (one-time code exchange). If there's no
    // oauth_code, it returns false synchronously.
    const _oauthParams = new URLSearchParams(window.location.search);
    if (_oauthParams.get("oauth_code")) {
        handleOAuthCallback();
        return;
    }
    // handleConfirmLink is async — it returns a Promise that resolves to
    // true/false. A Promise is always truthy, so `if (handleConfirmLink())`
    // always enters the block and returns, blocking handleResetLink() and
    // every other init step below. Check ?confirm= synchronously instead
    // (same pattern already used for ?validate= below).
    if (_oauthParams.get("confirm")) {
        handleConfirmLink();
        return;
    }
    if (handleResetLink()) {
        return;
    }
    // handleValidationLink is async — it returns a Promise that resolves to
    // true/false. We check synchronously whether ?validate= is in the URL;
    // if so, we kick off the async handler and skip the rest of init (the
    // handler will pre-fill the form and focus the password field).
    if (_oauthParams.get("validate")) {
        handleValidationLink();
        return;
    }
    handleQueryError();
    if (_oauthParams.get("register") === "1") {
        const tabReg = document.getElementById("coach-tab-register");
        if (tabReg) tabReg.click();
    }
    // Social login disabled — not worth maintaining OAuth config at the moment.
    // loadProviders();
})();
