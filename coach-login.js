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
    const REDIRECT = window.COACH_LOGIN_REDIRECT || "/members.php";
    let currentEmail = "";

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
    const regPasswordInput = document.getElementById("coach-reg-password");
    const regCodeInput   = document.getElementById("coach-reg-code");
    const regAliasInput  = document.getElementById("coach-reg-alias");
    const registerBtn    = document.getElementById("coach-register-btn");
    const registerStatus = document.getElementById("coach-register-status");

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
    async function establishServerSession(email, sessionToken) {
        try {
            await fetchWithTimeout(window.location.pathname, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: "action=backend-login&email=" + encodeURIComponent(email)
                    + "&sessionToken=" + encodeURIComponent(sessionToken),
            });
        } catch (_) {
            // Even if the server-side session POST fails, fall back to
            // sessionStorage so the chat still works within the tab.
        }
        // Always set sessionStorage as a fallback for client-side reads
        sessionStorage.setItem("qa_email", email);
        sessionStorage.setItem("qa_session_token", sessionToken);
        // Redirect to destination
        window.location.href = REDIRECT;
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

    function handleOAuthError() {
        const params = new URLSearchParams(window.location.search);
        const error = params.get("error");
        if (error) {
            showStatus(loginStatus, decodeURIComponent(error), "error");
            history.replaceState(null, "", window.location.pathname);
        }
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
                establishServerSession(data.email, data.sessionToken);
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
        showStep("reset");
        resetForm.dataset.token = token;
        resetPasswordInput.focus();
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
        if (!email || !password) return;
        currentEmail = email;
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

    // --- Toggle between login and register ---
    toggleBtn.addEventListener("click", () => {
        showStep("register");
        regEmailInput.focus();
    });

    toggleBackBtn.addEventListener("click", () => {
        showStep("login");
        emailInput.focus();
    });

    // --- Register form ---
    registerForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = regEmailInput.value.trim().toLowerCase();
        const password = regPasswordInput.value;
        const invitationCode = regCodeInput.value.trim();
        const alias = regAliasInput ? regAliasInput.value.trim() : "";
        if (!email || !password || !invitationCode) return;

        registerBtn.disabled = true;
        showStatus(registerStatus, "Creating your account...", "loading");

        try {
            const body = {
                email,
                password,
                invitationCode,
                captchaToken: getCaptchaToken(),
            };
            // Only include alias if the user provided one (empty string is
            // fine server-side, but omitting keeps the payload clean).
            if (alias) body.alias = alias;
            const resp = await fetchWithTimeout(API + "/v1/auth/register-with-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await resp.json();
            registerBtn.disabled = false;

            if (data.ok) {
                showStatus(registerStatus, data.message || "Check your email for a confirmation link.", "success");
                registerForm.reset();
            } else {
                showStatus(registerStatus, data.error || "Registration failed.", "error");
            }
            resetCaptchaToken("reg");
        } catch (err) {
            registerBtn.disabled = false;
            showStatus(registerStatus, "Network error: " + err.message, "error");
        }
    });

    // --- Reset password form ---
    resetForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const token = resetForm.dataset.token;
        const newPassword = resetPasswordInput.value;
        if (!token || !newPassword) return;

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
                establishServerSession(data.email, data.sessionToken);
            } else {
                showStatus(resetStatus, data.error || "Reset failed.", "error");
            }
        } catch (err) {
            resetBtn.disabled = false;
            showStatus(resetStatus, "Network error: " + err.message, "error");
        }
    });

    // --- Init ---
    // handleOAuthCallback is async (one-time code exchange). If there's no
    // oauth_code, it returns false synchronously.
    const _oauthParams = new URLSearchParams(window.location.search);
    if (_oauthParams.get("oauth_code")) {
        handleOAuthCallback();
        return;
    }
    if (handleConfirmLink()) {
        return;
    }
    if (handleResetLink()) {
        return;
    }
    handleOAuthError();
    // Social login disabled — not worth maintaining OAuth config at the moment.
    // loadProviders();
})();
