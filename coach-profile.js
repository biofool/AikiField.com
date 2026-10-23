/**
 * coach-profile.js — Profile management page logic.
 * Replicated from quantumaikido.com/coach-profile.js; the QA copy stays
 * authoritative for its own page. AikiField changes: the expired-session
 * "Go to sign in" link targets /login.php?next=/profile (this site's blind
 * login gate) instead of /members. The /members redirects below still work
 * here — AikiField's /members is the gated chat and bounces to login.php.
 *
 * Handles:
 *   - Loading the authenticated user's profile (GET /v1/auth/me)
 *   - Changing password (POST /v1/auth/change-password)
 *   - Changing email (POST /v1/auth/change-email)
 *   - Deleting account (POST /v1/auth/delete-account)
 *
 * Session: reads window.QA_SESSION (injected by profile.html via the shared
 * coach-auth-check.php — the PHP session cookie is the source of truth,
 * issue #328). Falls back to sessionStorage for backward compat with old
 * tabs. If no session is found, shows "must be signed in" message.
 */

(function () {
    "use strict";

    const API = window.COACH_API_BASE || "/coach-api";

    const authRequired = document.getElementById("coach-profile-auth-required");
    const profileContent = document.getElementById("coach-profile-content");
    const profileInfo = document.getElementById("coach-profile-info");

    const changePasswordForm = document.getElementById("coach-change-password-form");
    const changePasswordBtn = document.getElementById("coach-change-password-btn");
    const changePasswordStatus = document.getElementById("coach-change-password-status");

    const changeEmailForm = document.getElementById("coach-change-email-form");
    const changeEmailBtn = document.getElementById("coach-change-email-btn");
    const changeEmailStatus = document.getElementById("coach-change-email-status");

    const deleteAccountForm = document.getElementById("coach-delete-account-form");
    const deleteAccountBtn = document.getElementById("coach-delete-account-btn");
    const deleteAccountStatus = document.getElementById("coach-delete-account-status");

    // Issue #184: Chat preferences (language)
    const preferencesForm = document.getElementById("coach-preferences-form");
    const preferencesBtn = document.getElementById("coach-preferences-btn");
    const preferencesStatus = document.getElementById("coach-preferences-status");
    const prefLanguageSelect = document.getElementById("coach-pref-language");

    // --- Helpers ---

    function getSession() {
        const injected = window.QA_SESSION;
        if (injected && injected.email && injected.token) {
            return { email: injected.email, token: injected.token };
        }
        return {
            email: sessionStorage.getItem("qa_email") || "",
            token: sessionStorage.getItem("qa_session_token") || "",
        };
    }

    function setSession(email, token, expiresAt) {
        // Keep both stores in sync: window.QA_SESSION is what getSession()
        // prefers, sessionStorage is the backward-compat fallback.
        if (window.QA_SESSION) {
            window.QA_SESSION.email = email;
            window.QA_SESSION.token = token;
        }
        sessionStorage.setItem("qa_email", email);
        sessionStorage.setItem("qa_session_token", token);
        if (expiresAt) sessionStorage.setItem("qa_session_expires", expiresAt);
    }

    function clearSession() {
        if (window.QA_SESSION) {
            window.QA_SESSION.email = "";
            window.QA_SESSION.token = "";
        }
        sessionStorage.removeItem("qa_email");
        sessionStorage.removeItem("qa_session_token");
        sessionStorage.removeItem("qa_session_expires");
    }

    function authHeaders() {
        const session = getSession();
        return {
            "Content-Type": "application/json",
            "X-Auth-Email": session.email,
            "X-Auth-Session": session.token,
        };
    }

    function showStatus(el, msg, type) {
        el.hidden = false;
        el.className = "coach-status status-" + type;
        el.textContent = msg;
    }

    // A resp.json() SyntaxError means the server (or an edge-level
    // block/rate-limit page in front of it) returned a non-JSON body.
    // Surfacing the raw parser message is confusing — show a generic
    // retry message for that case. Other errors keep their specific message.
    function friendlyErrorMessage(err) {
        if (err instanceof SyntaxError) {
            return "Something went wrong. Please try again.";
        }
        return "Network error: " + (err && err.message ? err.message : "unknown");
    }

    // --- Init: check session and load profile ---

    const session = getSession();
    if (!session.email || !session.token) {
        authRequired.hidden = false;
        return;
    }

    profileContent.hidden = false;

    async function loadProfile() {
        profileInfo.innerHTML = '<p class="coach-intro">Loading your profile...</p>';
        try {
            const resp = await fetch(API + "/v1/auth/me", { headers: authHeaders() });
            if (resp.status === 401) {
                clearSession();
                profileContent.hidden = true;
                authRequired.hidden = false;
                authRequired.innerHTML = '<p class="coach-intro">Your session has expired. Please sign in again.</p><a href="/login.php?next=%2Fprofile" class="btn btn-primary">Go to sign in</a>';
                return;
            }
            const data = await resp.json();
            if (data.ok && data.profile) {
                const p = data.profile;
                const created = p.createdAt ? new Date(p.createdAt).toLocaleDateString() : "—";
                profileInfo.innerHTML = `
                    <div class="coach-profile-grid">
                        <div><strong>Email:</strong> ${p.email}</div>
                        <div><strong>Username:</strong> ${p.username}</div>
                        <div><strong>Email confirmed:</strong> ${p.emailConfirmed ? "Yes" : "No"}</div>
                        <div><strong>Admin:</strong> ${p.admin ? "Yes" : "No"}</div>
                        <div><strong>Member since:</strong> ${created}</div>
                    </div>`;
            } else {
                profileInfo.innerHTML = '<p class="coach-intro">Failed to load profile.</p>';
            }
        } catch (err) {
            profileInfo.innerHTML = '<p class="coach-intro">Network error: ' + err.message + "</p>";
        }
    }

    loadProfile();

    // Issue #184: Load language list + set the select from the user's profile
    async function loadLanguagePreferences() {
        if (!prefLanguageSelect) return;
        try {
            const [langResp, profileResp] = await Promise.all([
                fetch(API + "/v1/languages", { headers: authHeaders() }),
                fetch(API + "/v1/auth/me", { headers: authHeaders() }),
            ]);
            if (!langResp.ok) return;
            const langData = await langResp.json();
            const languages = langData.languages || [];
            // Group by region
            const byRegion = {};
            for (const lang of languages) {
                const region = lang.region || "Other";
                if (!byRegion[region]) byRegion[region] = [];
                byRegion[region].push(lang);
            }
            prefLanguageSelect.innerHTML = "";
            const enOption = document.createElement("option");
            enOption.value = "en";
            enOption.textContent = "English (auto-detect)";
            prefLanguageSelect.appendChild(enOption);
            for (const region of Object.keys(byRegion).sort()) {
                const group = document.createElement("optgroup");
                group.label = region;
                for (const lang of byRegion[region]) {
                    const opt = document.createElement("option");
                    opt.value = lang.bcp47;
                    opt.textContent = lang.language;
                    group.appendChild(opt);
                }
                prefLanguageSelect.appendChild(group);
            }
            // Set selected value from profile
            if (profileResp.ok) {
                const profileData = await profileResp.json();
                const pref = profileData.profile ? profileData.profile.preferredLanguage : null;
                prefLanguageSelect.value = pref || "en";
            }
        } catch (err) {
            console.warn("coach-profile: could not load language list:", err);
        }
    }

    loadLanguagePreferences();

    // Issue #184: Save language preference
    if (preferencesForm) {
        preferencesForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const lang = prefLanguageSelect.value;
            preferencesBtn.disabled = true;
            showStatus(preferencesStatus, "Saving...", "loading");
            try {
                const resp = await fetch(API + "/v1/auth/preferences", {
                    method: "POST",
                    headers: authHeaders(),
                    body: JSON.stringify({ preferredLanguage: lang }),
                });
                const data = await resp.json();
                preferencesBtn.disabled = false;
                if (data.ok) {
                    showStatus(preferencesStatus, "Preferences saved.", "success");
                } else {
                    showStatus(preferencesStatus, data.error || "Failed to save preferences.", "error");
                }
            } catch (err) {
                preferencesBtn.disabled = false;
                showStatus(preferencesStatus, friendlyErrorMessage(err), "error");
            }
        });
    }

    // --- Change password ---

    changePasswordForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const currentPw = document.getElementById("coach-current-password").value;
        const newPw = document.getElementById("coach-new-password").value;
        const confirmPw = document.getElementById("coach-confirm-password").value;
        // The form carries `novalidate`, so validate here with a visible
        // message rather than letting the browser reject the field with a
        // tooltip. Backend rule (AIRichardMoon `backend/app/auth.py`
        // change_password): 12-128 characters.
        const PASSWORD_MIN = 12;
        const PASSWORD_MAX = 128;
        if (!currentPw) {
            showStatus(changePasswordStatus, "Enter your current password.", "error");
            return;
        }
        if (!newPw) {
            showStatus(changePasswordStatus, "Choose a new password.", "error");
            return;
        }
        if (newPw.length < PASSWORD_MIN) {
            showStatus(changePasswordStatus, "New password must be at least "
                + PASSWORD_MIN + " characters — yours is " + newPw.length + ".", "error");
            return;
        }
        if (newPw.length > PASSWORD_MAX) {
            showStatus(changePasswordStatus, "New password must be " + PASSWORD_MAX
                + " characters or fewer — yours is " + newPw.length + ".", "error");
            return;
        }
        if (newPw !== confirmPw) {
            showStatus(changePasswordStatus, "New passwords do not match.", "error");
            return;
        }
        changePasswordBtn.disabled = true;
        showStatus(changePasswordStatus, "Changing password...", "loading");
        try {
            const resp = await fetch(API + "/v1/auth/change-password", {
                method: "POST",
                headers: authHeaders(),
                body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
            });
            const data = await resp.json();
            changePasswordBtn.disabled = false;
            if (data.ok) {
                showStatus(changePasswordStatus, data.message || "Password changed. Please log in again.", "success");
                changePasswordForm.reset();
                // Session is revoked — redirect to login after a short delay
                setTimeout(() => {
                    clearSession();
                    window.location.href = "/members";
                }, 2000);
            } else {
                showStatus(changePasswordStatus, data.error || "Failed to change password.", "error");
            }
        } catch (err) {
            changePasswordBtn.disabled = false;
            showStatus(changePasswordStatus, friendlyErrorMessage(err), "error");
        }
    });

    // --- Change email ---

    changeEmailForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const newEmail = document.getElementById("coach-new-email").value.trim().toLowerCase();
        const password = document.getElementById("coach-email-password").value;
        // The form carries `novalidate`, so the previously-native `required`
        // checks have to happen here — with a visible message, not a tooltip.
        const at = newEmail.indexOf("@");
        if (!newEmail || at < 1 || at === newEmail.length - 1 || /\s/.test(newEmail)) {
            showStatus(changeEmailStatus, "Enter a valid new email address.", "error");
            return;
        }
        if (!password) {
            showStatus(changeEmailStatus,
                "Enter your current password to confirm the change.", "error");
            return;
        }
        changeEmailBtn.disabled = true;
        showStatus(changeEmailStatus, "Changing email...", "loading");
        try {
            const resp = await fetch(API + "/v1/auth/change-email", {
                method: "POST",
                headers: authHeaders(),
                body: JSON.stringify({ newEmail, password }),
            });
            const data = await resp.json();
            changeEmailBtn.disabled = false;
            if (data.ok && data.sessionToken) {
                setSession(data.email, data.sessionToken, data.expiresAt);
                showStatus(changeEmailStatus, data.message || "Email updated.", "success");
                changeEmailForm.reset();
                // Reload profile to show new email
                setTimeout(() => loadProfile(), 1500);
            } else {
                showStatus(changeEmailStatus, data.error || "Failed to change email.", "error");
            }
        } catch (err) {
            changeEmailBtn.disabled = false;
            showStatus(changeEmailStatus, friendlyErrorMessage(err), "error");
        }
    });

    // --- Delete account ---

    deleteAccountForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const password = document.getElementById("coach-delete-password").value;
        // `novalidate` on the form means the native `required` no longer
        // stops an empty password — check before the confirm prompts so the
        // user is not walked through them only to fail at the backend.
        if (!password) {
            showStatus(deleteAccountStatus,
                "Enter your password to confirm account deletion.", "error");
            return;
        }
        if (!confirm("Are you sure you want to permanently delete your account? This cannot be undone.")) return;
        if (!confirm("This will permanently erase your account and all associated data. Type DELETE in the next prompt to confirm.")) return;
        const confirmation = prompt("Type DELETE to confirm account deletion:");
        if (confirmation !== "DELETE") {
            showStatus(deleteAccountStatus, "Account deletion cancelled.", "info");
            return;
        }
        deleteAccountBtn.disabled = true;
        showStatus(deleteAccountStatus, "Deleting account...", "loading");
        try {
            const resp = await fetch(API + "/v1/auth/delete-account", {
                method: "POST",
                headers: authHeaders(),
                body: JSON.stringify({ password }),
            });
            const data = await resp.json();
            deleteAccountBtn.disabled = false;
            if (data.ok) {
                showStatus(deleteAccountStatus, data.message || "Account deleted.", "success");
                setTimeout(() => {
                    clearSession();
                    window.location.href = "/members";
                }, 2000);
            } else {
                showStatus(deleteAccountStatus, data.error || "Failed to delete account.", "error");
            }
        } catch (err) {
            deleteAccountBtn.disabled = false;
            showStatus(deleteAccountStatus, friendlyErrorMessage(err), "error");
        }
    });
})();
