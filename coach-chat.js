// Chat-only JS — AikiField /members (members.php), "Enter the Unified Field
// Chat". Replicated from quantumaikido.com/coach-chat.js; the QA copy stays
// live. AikiField differences: login is the blind /login.php (post-login
// redirect via ?next=, not ?redirect=), and the contact page is
// /contact.html. Keep the rest in sync with the QA source.
//
// Original header (QA): Chat-only JS — members.php, members_social.php (issue #51)
// Reads the session from window.QA_SESSION (injected by PHP via the shared
// auth-check include) instead of sessionStorage. Handles the chat UI only —
// login is handled by login.php + coach-login.js.
//
// This file consolidates the chat logic from coach-auth.js and
// coach-auth-social.js. It includes the issue #17 resilience fixes
// (fetchWithTimeout, httpErrorMessage, validateChatResponse, handoff room
// URL rendering, Clear conversation control).

(function() {
    "use strict";

    const API = window.COACH_API_BASE || "/coach-api";
    const FORCE_STAGING = window.COACH_FORCE_STAGING === true;

    // Session is injected by PHP (includes/coach-auth-check.php) via a JSON
    // <script> tag that sets window.QA_SESSION. Fall back to sessionStorage
    // for backward compat with old tabs.
    const SESSION = window.QA_SESSION || {
        email: sessionStorage.getItem("qa_email") || "",
        token: sessionStorage.getItem("qa_session_token") || "",
        targetEnv: sessionStorage.getItem("qa_target_env") || "both",
        isAdmin: false,
        premium: false,
    };

    let targetEnvironment = FORCE_STAGING ? "staging" : (SESSION.targetEnv || "both");
    let selectedEnv = FORCE_STAGING ? "staging" : (sessionStorage.getItem("qa_selected_env") || "production");
    const CHAT_SESSION_KEY = "qa_chat_session_id";
    let currentSessionId = sessionStorage.getItem(CHAT_SESSION_KEY) || "";

    function startNewSession() {
        currentSessionId = "web_" + Date.now();
        sessionStorage.setItem(CHAT_SESSION_KEY, currentSessionId);
        return currentSessionId;
    }

    // --- DOM refs ---
    const messagesDiv    = document.getElementById("coach-messages");
    const chatForm       = document.getElementById("coach-chat-form");
    const chatInput      = document.getElementById("coach-chat-input");
    const sendBtn        = document.getElementById("coach-send-btn");
    const charCount      = document.getElementById("coach-char-count");
    const queueBanner    = document.getElementById("coach-queue-banner");
    const userInfo       = document.getElementById("coach-user-info");
    const logoutBtn      = document.getElementById("coach-logout");
    const clearBtn       = document.getElementById("coach-clear-btn");
    const languageSelect = document.getElementById("coach-language-select");
    const sessionSelect  = document.getElementById("coach-session-select");
    const newChatBtn     = document.getElementById("coach-new-chat-btn");
    const introPanel     = document.getElementById("coach-intro-panel");
    const toastEl        = document.getElementById("coach-toast");
    const toastMsg       = document.getElementById("coach-toast-msg");
    const toastUndoBtn   = document.getElementById("coach-toast-undo");

    // New Features popover UI elements (replaces the old voice-only toggle)
    const featuresBtn       = document.getElementById("coach-features-btn");
    const featuresPopover   = document.getElementById("coach-features-popover");
    const featuresClose     = document.getElementById("coach-features-close");
    const featuresList      = document.getElementById("coach-features-list");
    const featuresEnableList = document.getElementById("coach-features-enable-list");
    const featuresEnableColumn = document.getElementById("coach-features-enable-column");
    const featuresStatus    = document.getElementById("coach-features-status");

    // Cached admin describe() entries for the enable-on-staging toggles:
    // [{key, label, description, enabled, ...}] from GET /v1/admin/feature-flags.
    let currentFeatureFlags = [];

    // Issue #184: selected response language. "en" = auto-detect (no directive).
    let selectedLanguage = "en";
    let profileLoaded = false;

    // Voice response feature is in development — the coach will respond
    // verbally using a clone of Richard Moon's voice. No voice playback yet.
    // The toggle now serves as a "notify me" opt-in.

    // Environment toggle
    const envControls    = document.getElementById("coach-env-controls");
    const envToggle      = document.getElementById("coach-env-toggle");
    const envBanner      = document.getElementById("coach-env-banner");

    // --- Helpers ---
    function authHeaders() {
        const headers = {
            "Content-Type": "application/json",
            "X-Auth-Email": SESSION.email,
            "X-Auth-Session": SESSION.token,
        };
        if (FORCE_STAGING || selectedEnv === "staging") {
            headers["X-Target-Environment"] = "staging";
        }
        return headers;
    }

    // --- Welcome message A/B variations (issue #257) ---
    // 5 variations stored in /data/welcome-messages.json. One is randomly
    // selected per chat session and its ID is sent with any feedback on the
    // welcome message so the dashboard can track per-variation reactions.
    let currentWelcomeId = "";
    const WELCOME_FALLBACK = "Welcome! I'm <em>Discussing The Unified Field</em>, grounded in <em>Quantum Aikido</em>.<br>I can adjust to your learning style and your preferred language. Just drop a note in the chat about it when you ask a question.<br><br>My knowledge comes from Richard Moon's <em>books, videos, and private coaching writings</em>.<br>Let's begin with something useful: <em>How to get luckier.</em>";

    async function loadWelcomeVariation() {
        try {
            const resp = await fetchWithTimeout("/data/welcome-messages.json", { headers: { "Accept": "application/json" } }, { timeoutMs: 3000, slowNotice: false });
            if (!resp.ok) throw new Error("HTTP " + resp.status);
            const data = await resp.json();
            if (data && Array.isArray(data.variations) && data.variations.length > 0) {
                const pick = data.variations[Math.floor(Math.random() * data.variations.length)];
                currentWelcomeId = pick.id || "";
                return pick.html || WELCOME_FALLBACK;
            }
        } catch (e) {
            console.warn("coach-chat: could not load welcome variations, using fallback", e);
        }
        currentWelcomeId = "fallback";
        return WELCOME_FALLBACK;
    }

    // --- Link preview / rich link cards (issue #217) ---
    // URL regex: matches http(s)://... up to whitespace or end of string.
    // Excludes trailing punctuation that's not part of the URL.
    const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;

    // Corpus timestamp markers, e.g. "<!-- t=00:14:30 -->" (see the video
    // deep-link handling below). These are internal metadata the backend is
    // supposed to resolve into `startSeconds` before a chunk of corpus text
    // reaches the client. When a raw excerpt (e.g. "doku of the hour",
    // issue #236) skips that resolution, the marker leaks into the chat as
    // literal, visible text — linkifyText() renders it as a plain text node,
    // not an actual (invisible) HTML comment. Strip it here as an output
    // filter so any AI-rendered text is safe regardless of the source.
    const TIMESTAMP_MARKER_RE = /<!--\s*t=\d{1,2}:\d{2}:\d{2}(?:\.\d+)?\s*-->/gi;

    function stripTimestampMarkers(text) {
        if (typeof text !== "string" || !text) return text;
        return text
            .replace(TIMESTAMP_MARKER_RE, "")
            // Collapse whitespace left behind by a removed marker (a run of
            // spaces/tabs, or 3+ blank lines) without touching normal
            // paragraph breaks.
            .replace(/[ \t]{2,}/g, " ")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
    }

    // Cache of URL → LinkPreview result, so repeated URLs in a conversation
    // don't re-fetch. Persists for the page lifetime.
    const _linkPreviewCache = new Map();

    // Max link cards per message (matches backend link_preview_max_cards_per_message).
    const MAX_LINK_CARDS = 3;

    // Truncate a URL for display: show domain + first path segment + "…"
    function truncateUrl(url, maxLen) {
        if (url.length <= (maxLen || 50)) return url;
        try {
            const u = new URL(url);
            const path = u.pathname.length > 1 ? u.pathname.split("/")[1] : "";
            const display = path ? u.hostname + "/" + path + "/…" : u.hostname + "/…";
            return display.length > (maxLen || 50) ? u.hostname + "/…" : display;
        } catch {
            return url.substring(0, (maxLen || 50) - 1) + "…";
        }
    }

    // Split text into text nodes and URL placeholder elements.
    // XSS-safe: text segments use textContent, never innerHTML.
    // `state` (optional) carries the link-card counter across several calls so the
    // MAX_LINK_CARDS cap applies per message, not per paragraph (issue #324).
    function linkifyText(text, state) {
        state = state || { cards: 0 };
        const frag = document.createDocumentFragment();
        if (typeof text !== "string" || !text) {
            frag.appendChild(document.createTextNode(text || ""));
            return frag;
        }
        URL_RE.lastIndex = 0;
        let lastIdx = 0;
        let match;
        while ((match = URL_RE.exec(text)) !== null) {
            // Text before the URL
            if (match.index > lastIdx) {
                frag.appendChild(document.createTextNode(text.substring(lastIdx, match.index)));
            }
            const rawUrl = match[0];
            // Truncate trailing punctuation
            const cleanUrl = rawUrl.replace(/[.,;:!?)]+$/, "");
            if (state.cards < MAX_LINK_CARDS) {
                // Create a placeholder that will be replaced by a link card
                const placeholder = document.createElement("span");
                placeholder.className = "coach-link-placeholder";
                placeholder.dataset.url = cleanUrl;
                placeholder.textContent = truncateUrl(cleanUrl);
                frag.appendChild(placeholder);
                state.cards++;
            } else {
                // Beyond the card limit — show as a plain truncated clickable link
                const link = document.createElement("a");
                link.href = cleanUrl;
                link.target = "_blank";
                link.rel = "noopener noreferrer";
                link.className = "coach-link-fallback";
                link.textContent = truncateUrl(cleanUrl);
                frag.appendChild(link);
            }
            // Resume after the cleaned URL so trailing punctuation ("see
            // https://x.com/a.") stays in the text instead of being dropped.
            lastIdx = match.index + cleanUrl.length;
            URL_RE.lastIndex = lastIdx;
        }
        // Trailing text
        if (lastIdx < text.length) {
            frag.appendChild(document.createTextNode(text.substring(lastIdx)));
        }
        return frag;
    }

    // Issue #324: keep the paragraph structure of AI replies. "\n\n" starts a new
    // <p>, a single "\n" becomes <br>. Every text segment still goes through
    // linkifyText(), i.e. text nodes / DOM elements only. Model output is never
    // assigned to innerHTML, so it cannot inject markup.
    function renderRichText(container, text) {
        const state = { cards: 0 };
        const paragraphs = String(text || "").replace(/\r\n?/g, "\n").split(/\n{2,}/);
        for (const para of paragraphs) {
            if (!para.trim()) continue;
            const p = document.createElement("p");
            p.className = "coach-para";
            para.split("\n").forEach(function(line, idx) {
                if (idx > 0) p.appendChild(document.createElement("br"));
                p.appendChild(linkifyText(line, state));
            });
            container.appendChild(p);
        }
    }

    // Fetch OG metadata for a URL and replace the placeholder with a link card.
    // Falls back to a truncated clickable link on any error.
    async function fetchAndRenderLinkCard(placeholder) {
        const url = placeholder.dataset.url;
        if (!url) return;

        // Check cache first
        if (_linkPreviewCache.has(url)) {
            const cached = _linkPreviewCache.get(url);
            renderLinkCard(placeholder, url, cached);
            return;
        }

        // Show skeleton while fetching
        const skeleton = document.createElement("div");
        skeleton.className = "coach-link-card-skeleton";
        placeholder.replaceWith(skeleton);

        try {
            const resp = await fetchWithTimeout(
                API + "/v1/link-preview?url=" + encodeURIComponent(url),
                { headers: authHeaders(), method: "GET" },
                { timeoutMs: 8000, retries: 0, slowNotice: false }
            );
            if (!resp.ok) throw new Error("link-preview returned " + resp.status);
            const data = await resp.json();
            _linkPreviewCache.set(url, data);
            renderLinkCard(skeleton, url, data);
        } catch (err) {
            // Fallback: truncated clickable link
            const link = document.createElement("a");
            link.href = url;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.className = "coach-link-fallback";
            link.textContent = truncateUrl(url);
            skeleton.replaceWith(link);
        }
    }

    // Render a link card from OG metadata, or a fallback link if no metadata.
    function renderLinkCard(element, url, data) {
        if (!data || (!data.title && !data.description && !data.image)) {
            // No metadata — show truncated clickable link
            const link = document.createElement("a");
            link.href = url;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.className = "coach-link-fallback";
            link.textContent = truncateUrl(url);
            element.replaceWith(link);
            return;
        }

        const card = document.createElement("a");
        card.href = data.url || url;
        card.target = "_blank";
        card.rel = "noopener noreferrer";
        card.className = "coach-link-card";

        if (data.image) {
            const thumb = document.createElement("img");
            thumb.className = "coach-link-card-thumb";
            thumb.src = data.image;
            thumb.alt = "";
            thumb.loading = "lazy";
            thumb.onerror = function() { this.style.display = "none"; };
            card.appendChild(thumb);
        }

        const body = document.createElement("div");
        body.className = "coach-link-card-body";

        if (data.title) {
            const title = document.createElement("div");
            title.className = "coach-link-card-title";
            title.textContent = data.title;
            body.appendChild(title);
        }
        if (data.description) {
            const desc = document.createElement("div");
            desc.className = "coach-link-card-desc";
            desc.textContent = data.description;
            body.appendChild(desc);
        }

        // Site name or domain
        const site = document.createElement("div");
        site.className = "coach-link-card-site";
        try {
            const u = new URL(data.url || url);
            site.textContent = data.siteName || u.hostname;
        } catch {
            site.textContent = data.siteName || "";
        }
        body.appendChild(site);

        card.appendChild(body);
        element.replaceWith(card);
    }

    // After a message is added to the DOM, find all link placeholders and
    // fetch their OG metadata in parallel.
    function enrichLinkCards(msgDiv) {
        const placeholders = msgDiv.querySelectorAll(".coach-link-placeholder");
        placeholders.forEach(fetchAndRenderLinkCard);
    }

    // Issue #184: Language selector — fetch the language list from the backend,
    // populate the <select> grouped by region, and load the user's durable
    // preferredLanguage. On change, persist via POST /v1/auth/preferences.
    async function initLanguageSelector() {
        if (!languageSelect) return;
        try {
            // Fetch the language list + the user's profile in parallel
            const [langResp, profileResp] = await Promise.all([
                fetchWithTimeout(API + "/v1/languages", { headers: authHeaders() }),
                fetchWithTimeout(API + "/v1/auth/me", { headers: authHeaders() }),
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
            // Build the <select> with <optgroup> per region
            // Keep the existing "English (auto-detect)" option as the first entry
            const currentVal = languageSelect.value;
            languageSelect.innerHTML = "";
            const enOption = document.createElement("option");
            enOption.value = "en";
            enOption.textContent = "English (auto-detect)";
            languageSelect.appendChild(enOption);
            for (const region of Object.keys(byRegion).sort()) {
                const group = document.createElement("optgroup");
                group.label = region;
                for (const lang of byRegion[region]) {
                    const opt = document.createElement("option");
                    opt.value = lang.bcp47;
                    opt.textContent = lang.language;
                    group.appendChild(opt);
                }
                languageSelect.appendChild(group);
            }
            // Set selected value from the user's profile
            if (profileResp.ok) {
                const profileData = await profileResp.json();
                const pref = profileData.profile ? profileData.profile.preferredLanguage : null;
                if (pref) {
                    selectedLanguage = pref;
                    languageSelect.value = pref;
                } else {
                    selectedLanguage = "en";
                    languageSelect.value = "en";
                }
            } else {
                languageSelect.value = currentVal || "en";
            }
        } catch (err) {
            console.warn("coach-chat: could not load language list:", err);
        } finally {
            profileLoaded = true;
        }
    }

    // Persist language preference on change (fire-and-forget)
    if (languageSelect) {
        languageSelect.addEventListener("change", function() {
            selectedLanguage = languageSelect.value;
            profileLoaded = true;
            // Fire-and-forget save — don't block the UI
            fetchWithTimeout(API + "/v1/auth/preferences", {
                method: "POST",
                headers: authHeaders(),
                body: JSON.stringify({ preferredLanguage: selectedLanguage }),
            }).catch(function(err) {
                console.warn("coach-chat: could not save language preference:", err);
            });
        });
    }

    // ─── New Features popover ───────────────────────────────────────────
    // Replaces the old voice-only "coming soon" notify-me button.
    // The "New Features" button lives at the far end of the toolbar and
    // opens a popover listing features under consideration. Each feature
    // has a thumbs-up button the user can click to record interest. Interest is
    // persisted in localStorage and sent to the backend via
    // /v1/voice/notify-request (which now accepts a features list).
    var FEATURES_KEY = "qa_feature_interest";

    function getFeatureInterest() {
        try { return JSON.parse(localStorage.getItem(FEATURES_KEY) || "{}"); }
        catch (e) { return {}; }
    }

    function setFeatureInterest(features) {
        try { localStorage.setItem(FEATURES_KEY, JSON.stringify(features)); }
        catch (e) { console.warn("coach-chat: could not persist feature interest:", e); }
    }

    function showFeaturesStatus(msg, isError) {
        if (!featuresStatus) return;
        featuresStatus.textContent = msg;
        featuresStatus.hidden = false;
        featuresStatus.classList.toggle("coach-features-status-error", !!isError);
        // Auto-hide success messages after 4 seconds
        if (!isError) {
            setTimeout(function() { featuresStatus.hidden = true; }, 4000);
        }
    }

    var notifyTimer = null;
    function scheduleNotifyBackendFeatures() {
        // Debounce: a burst of thumb clicks produces one notification with the
        // final interest set, not one admin email per click (issue #314). The
        // payload is re-read at fire time so the latest state is sent.
        if (notifyTimer) clearTimeout(notifyTimer);
        notifyTimer = setTimeout(function() {
            notifyTimer = null;
            notifyBackendFeatures(getFeatureInterest());
        }, 1500);
    }

    function notifyBackendFeatures(features) {
        var userEmail = SESSION.email || "your registered email";
        fetchWithTimeout(API + "/v1/voice/notify-request", {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ features: features }),
        }, { timeoutMs: 5000, retries: 0, slowNotice: false })
            .then(function(r) { return r.ok ? r.json() : null; })
            .then(function(data) {
                if (data && data.ok) {
                    var names = Object.keys(features).filter(function(k) { return features[k]; });
                    console.info("coach-chat: feature interest sent for " + userEmail + ": " + names.join(", "));
                    showFeaturesStatus("Thanks! We'll notify " + userEmail + " when your selected features launch.", false);
                } else {
                    showFeaturesStatus("We hit a snag recording your interest. Please try again.", true);
                }
            })
            .catch(function(e) {
                console.warn("coach-chat: feature notify request failed:", e);
                showFeaturesStatus("We couldn't reach the server to record your interest. Please try again.", true);
            });
    }

    function canToggleFlags() {
        return (FORCE_STAGING || selectedEnv === "staging") && SESSION.isAdmin;
    }

    async function fetchFeatureFlags() {
        // The enable column is generated from the flag registry via the admin
        // describe() payload — only meaningful to admins on staging (issue #313).
        if (!canToggleFlags()) return;
        try {
            var flagsResp = await fetchWithTimeout(API + "/v1/admin/feature-flags", {
                headers: authHeaders(),
            }, { timeoutMs: 5000, retries: 0, slowNotice: false });
            if (!flagsResp.ok) return;
            var data = await flagsResp.json();
            if (data && Array.isArray(data.flags)) {
                currentFeatureFlags = data.flags;
            }
        } catch (e) {
            console.warn("coach-chat: could not fetch feature flags:", e);
        }
    }

    function buildEnableItem(entry) {
        var li = document.createElement("li");
        li.className = "coach-feature-item coach-feature-enable-item";
        li.setAttribute("data-feature", entry.key);

        var switchLabel = document.createElement("label");
        switchLabel.className = "coach-feature-enable-switch";
        switchLabel.setAttribute("aria-label", "Enable " + (entry.label || entry.key) + " on staging");

        var input = document.createElement("input");
        input.type = "checkbox";
        input.setAttribute("data-feature", entry.key);
        input.className = "coach-feature-enable-input";
        input.checked = !!entry.enabled;

        var slider = document.createElement("span");
        slider.className = "coach-feature-enable-slider";

        switchLabel.appendChild(input);
        switchLabel.appendChild(slider);

        var info = document.createElement("div");
        info.className = "coach-feature-info";
        var name = document.createElement("span");
        name.className = "coach-feature-name";
        name.textContent = entry.label || entry.key;
        info.appendChild(name);
        if (entry.description) {
            var desc = document.createElement("span");
            desc.className = "coach-feature-desc";
            desc.textContent = entry.description;
            info.appendChild(desc);
        }

        li.appendChild(switchLabel);
        li.appendChild(info);
        return li;
    }

    function renderEnableToggles() {
        if (!featuresEnableList || !featuresEnableColumn) return;
        featuresEnableList.innerHTML = "";
        // Registry-driven (issue #313): only flags that exist server-side are
        // rendered, and only for admins who can actually toggle them on staging.
        var allowed = canToggleFlags();
        featuresEnableColumn.hidden = !allowed || currentFeatureFlags.length === 0;
        if (!allowed) return;
        currentFeatureFlags.forEach(function(entry) {
            var li = buildEnableItem(entry);
            li.querySelector(".coach-feature-enable-input").addEventListener("change", async function(e) {
                var input = e.target;
                var feature = input.getAttribute("data-feature");
                var enabled = input.checked;
                try {
                    var resp = await fetchWithTimeout(API + "/v1/admin/feature-flags", {
                        method: "PATCH",
                        headers: authHeaders(),
                        body: JSON.stringify({ key: feature, enabled: enabled }),
                    }, { timeoutMs: 5000, retries: 0, slowNotice: false });
                    if (resp.ok) {
                        var data = await resp.json().catch(function() { return null; });
                        if (data && Array.isArray(data.flags)) currentFeatureFlags = data.flags;
                        showFeaturesStatus("Feature updated.", false);
                    } else {
                        throw new Error("HTTP " + resp.status);
                    }
                } catch (err) {
                    console.warn("coach-chat: could not update feature flag:", err);
                    input.checked = !input.checked;
                    showFeaturesStatus("Could not update feature.", true);
                }
            });
            featuresEnableList.appendChild(li);
        });
    }

    function initFeaturesPopover() {
        if (!featuresBtn || !featuresPopover) return;

        // Restore previously saved interest states
        var saved = getFeatureInterest();
        var thumbs = featuresList.querySelectorAll(".coach-feature-thumb");
        thumbs.forEach(function(btn) {
            var feature = btn.getAttribute("data-feature");
            var interested = !!saved[feature];
            btn.setAttribute("aria-pressed", String(interested));
            btn.classList.toggle("coach-feature-thumb--active", interested);
        });

        // Toggle popover open/close (fetch current flags each time it opens)
        // The button lives inside the More menu, which closes when it is
        // activated. When the popover closes, focus therefore goes back to the
        // visible trigger: the menu item if the menu is open, else "More".
        function closeFeaturesPopover() {
            featuresPopover.hidden = true;
            featuresBtn.setAttribute("aria-expanded", "false");
            var moreBtn = document.getElementById("coach-more-btn");
            var target = featuresBtn.offsetParent !== null ? featuresBtn : moreBtn;
            if (target) target.focus();
        }

        featuresBtn.addEventListener("click", function() {
            var isOpen = !featuresPopover.hidden;
            featuresPopover.hidden = isOpen;
            featuresBtn.setAttribute("aria-expanded", String(!isOpen));
            if (!isOpen) {
                if (featuresClose) featuresClose.focus();
                fetchFeatureFlags().then(function() {
                    renderEnableToggles();
                });
            }
        });

        // Close button
        if (featuresClose) {
            featuresClose.addEventListener("click", closeFeaturesPopover);
        }

        // Click outside to close
        document.addEventListener("click", function(e) {
            if (featuresPopover.hidden) return;
            var wrap = document.getElementById("coach-features-wrap");
            if (wrap && !wrap.contains(e.target) && !featuresBtn.contains(e.target)) {
                featuresPopover.hidden = true;
                featuresBtn.setAttribute("aria-expanded", "false");
            }
        });

        // Escape to close
        document.addEventListener("keydown", function(e) {
            if (e.key === "Escape" && !featuresPopover.hidden) {
                closeFeaturesPopover();
            }
        });

        // Per-feature thumbs-up: persist + notify backend (interest list)
        thumbs.forEach(function(btn) {
            btn.addEventListener("click", function() {
                var feature = btn.getAttribute("data-feature");
                var interested = btn.getAttribute("aria-pressed") !== "true";
                btn.setAttribute("aria-pressed", String(interested));
                btn.classList.toggle("coach-feature-thumb--active", interested);
                var current = getFeatureInterest();
                current[feature] = interested;
                setFeatureInterest(current);
                // Debounced: a burst of clicks sends one notification with the
                // final interest set (issue #314).
                scheduleNotifyBackendFeatures();
            });
        });

        // Enable-on-staging items are generated by renderEnableToggles() from
        // the admin describe() payload when the popover opens (issue #313).
    }

    initFeaturesPopover();

    function setEnvState(target, selected) {
        targetEnvironment = target;
        if (selected) selectedEnv = selected;
        sessionStorage.setItem("qa_target_env", targetEnvironment);
        sessionStorage.setItem("qa_selected_env", selectedEnv);
    }

    function updateEnvUI() {
        if (envControls) envControls.hidden = true;
        if (envBanner) envBanner.hidden = true;
        if (!envBanner) return;

        if (FORCE_STAGING) {
            selectedEnv = "staging";
            envBanner.hidden = false;
            envBanner.innerHTML = "You're on the <strong>staging</strong> test site — help us test the latest features before they go live. " +
                "Please report any issues through the <a href=\"/contact.html\">contact form</a>. " +
                "<a href=\"/members\">Return to the live site</a>.";
        } else if (targetEnvironment === "both") {
            if (envControls) envControls.hidden = false;
            if (envToggle) envToggle.dataset.env = selectedEnv;
        } else if (targetEnvironment === "staging") {
            selectedEnv = "staging";
            envBanner.hidden = false;
            envBanner.innerHTML = "You're using the <strong>staging</strong> environment — help us test the latest features. " +
                "Your feedback is valuable! Please report any issues through the <a href=\"/contact.html\">contact form</a>.";
        } else {
            selectedEnv = "production";
            envBanner.hidden = false;
            envBanner.innerHTML = "Want to help test new features before they go live? " +
                "Ask about getting access to our <strong>staging</strong> environment — " +
                "use the <a href=\"/contact.html\">contact form</a> to volunteer.";
        }
    }

    // Cold-start notice (biofool/AIRichardMoon#817). The coaching backend
    // scales to zero with no keep-warm job (owner decision, 2026-10-04), so
    // the first request after a quiet period waits while Cloud Run starts an
    // instance (measured 10-17s, up to ~30s). If a request is still pending
    // after COLD_START_NOTICE_MS, show a polite notice with a progress bar so
    // the wait does not look like a hang. A counter (not a flag) covers
    // overlapping requests; the notice hides when the last one settles.
    // Background calls with short timeouts pass { slowNotice: false }.
    //
    // The bar is time-based, not real progress — Cloud Run reports none. It
    // eases toward COLD_START_BAR_CAP so it never claims to be finished, then
    // fills to 100% when the request settles.
    const COLD_START_NOTICE_MS = 4000;
    const COLD_START_BAR_TAU_MS = 8000;
    const COLD_START_BAR_CAP = 95;
    const COLD_START_TICK_MS = 250;
    const COLD_START_DONE_HOLD_MS = 400;
    const COLD_START_NOTICE_TEXT = "The coach is starting up, so there is a slight delay. This usually takes 10 to 20 seconds.";
    let coldStartPending = 0;
    let coldStartEl = null;
    let coldStartText = null;
    let coldStartBar = null;
    let coldStartFill = null;
    let coldStartTicker = null;
    let coldStartHideTimer = null;

    function coldStartNotice() {
        if (!coldStartEl) {
            coldStartEl = document.createElement("div");
            coldStartEl.className = "coach-coldstart-notice";
            coldStartEl.setAttribute("role", "status");
            coldStartEl.setAttribute("aria-live", "polite");
            coldStartEl.hidden = true;
            coldStartText = document.createElement("p");
            coldStartText.className = "coach-coldstart-text";
            coldStartBar = document.createElement("div");
            coldStartBar.className = "coach-coldstart-bar";
            coldStartBar.setAttribute("role", "progressbar");
            coldStartBar.setAttribute("aria-label", "Starting the coach");
            coldStartBar.setAttribute("aria-valuemin", "0");
            coldStartBar.setAttribute("aria-valuemax", "100");
            coldStartFill = document.createElement("div");
            coldStartFill.className = "coach-coldstart-fill";
            coldStartBar.appendChild(coldStartFill);
            coldStartEl.append(coldStartText, coldStartBar);
            document.body.appendChild(coldStartEl);
        }
        return coldStartEl;
    }

    function setColdStartProgress(pct) {
        const value = Math.round(pct);
        coldStartFill.style.width = value + "%";
        coldStartBar.setAttribute("aria-valuenow", String(value));
    }

    function showColdStartNotice(startedAt) {
        const el = coldStartNotice();
        clearTimeout(coldStartHideTimer);
        el.hidden = false;
        coldStartText.textContent = COLD_START_NOTICE_TEXT;
        const tick = () => {
            const elapsed = Date.now() - startedAt;
            setColdStartProgress(COLD_START_BAR_CAP * (1 - Math.exp(-elapsed / COLD_START_BAR_TAU_MS)));
        };
        tick();
        coldStartTicker = setInterval(tick, COLD_START_TICK_MS);
    }

    function hideColdStartNotice() {
        clearInterval(coldStartTicker);
        coldStartTicker = null;
        setColdStartProgress(100);
        coldStartHideTimer = setTimeout(() => {
            coldStartEl.hidden = true;
            coldStartText.textContent = "";
        }, COLD_START_DONE_HOLD_MS);
    }

    function trackSlowRequest() {
        const startedAt = Date.now();
        let shown = false;
        const timer = setTimeout(() => {
            shown = true;
            coldStartPending++;
            if (!coldStartTicker) showColdStartNotice(startedAt);
        }, COLD_START_NOTICE_MS);
        return function settle() {
            clearTimeout(timer);
            if (!shown) return;
            coldStartPending--;
            if (coldStartPending === 0) hideColdStartNotice();
        };
    }

    async function fetchWithTimeout(url, opts, options = {}) {
        const settle = options.slowNotice === false ? null : trackSlowRequest();
        try {
            return await fetchWithRetry(url, opts, options);
        } finally {
            if (settle) settle();
        }
    }

    // Fetch with timeout and bounded retry/backoff (issue #17).
    async function fetchWithRetry(url, opts, { timeoutMs = 35000, retries = 2, baseDelayMs = 500 } = {}) {
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
                // If the request timed out (AbortError), don't retry — server is busy or hung
                if (err && err.name === "AbortError") {
                    break;
                }
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
        if (status === 401) return "Your session has expired. Please sign in again.";
        if (status === 403) return "You don't have permission to do that. Try signing in again.";
        if (status === 413) return "Your message is too long. Please shorten it to under 4,000 characters.";
        if (status === 429) return "The coach is busy with other members right now. Please wait a moment and try again.";
        if (status >= 500) return "The coaching service is temporarily unavailable. Please try again in a moment.";
        return fallback || "Something went wrong. Please try again.";
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

    function validateChatResponse(data) {
        if (!data || typeof data !== "object") return null;
        const response = typeof data.response === "string" ? data.response : "";
        const sources = Array.isArray(data.sources) ? data.sources.filter(s => s && typeof s === "object") : [];
        const intent = data.intent === "handoff" ? "handoff" : "ai";
        const roomUrl = typeof data.roomUrl === "string" ? data.roomUrl : null;
        const handoffId = typeof data.handoffId === "string" ? data.handoffId : null;
        const degraded = data.degraded === true;
        // #731/#340: pass the backend's session id through so the caller can
        // adopt it (bounded string only — it is a conversation id, not a token).
        const sessionId = typeof data.sessionId === "string" && data.sessionId.length <= 128
            ? data.sessionId : null;
        return { response, sources, intent, roomUrl, handoffId, degraded, sessionId };
    }

    // Issue #324: auto-scroll only when the reader is already near the bottom.
    // If they scrolled up to re-read, leave them there and offer the
    // "Jump to latest" button instead of yanking the list away.
    const NEAR_BOTTOM_PX = 80;
    function isNearBottom() {
        if (!messagesDiv) return true;
        return messagesDiv.scrollHeight - messagesDiv.scrollTop - messagesDiv.clientHeight < NEAR_BOTTOM_PX;
    }
    function scrollToLatest() {
        if (messagesDiv) messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
    // followBottom remembers whether the reader was at the bottom before the
    // last layout change (soft keyboard, resize), when the geometry alone can
    // no longer tell us.
    let followBottom = true;
    function updateJumpButton() {
        const near = isNearBottom();
        followBottom = near;
        const btn = document.getElementById("coach-scroll-bottom-btn");
        if (btn) btn.hidden = near;
    }

    // Empty state (issue #323): the intro card inside the message list is only
    // visible while #coach-messages carries .is-empty.
    function setEmptyState(isEmpty) {
        if (messagesDiv) messagesDiv.classList.toggle("is-empty", !!isEmpty);
    }

    // Remove every message but keep the intro card (it lives inside the list).
    function clearMessageNodes() {
        if (!messagesDiv) return;
        Array.from(messagesDiv.children).forEach(function(node) {
            if (node !== introPanel) node.remove();
        });
    }

    // A source is a link only when it carries an http(s) URL or a site-relative
    // path. Anything else (e.g. a corpus file path) is shown as plain text.
    function sourceHref(s) {
        const candidate = s && (s.url || s.link || s.sourceUrl || s.path);
        if (typeof candidate !== "string" || !candidate) return null;
        if (candidate.indexOf("//") === 0) return null;
        if (!/^(https?:\/\/|\/)/i.test(candidate)) return null;
        try {
            const u = new URL(candidate, window.location.origin);
            return (u.protocol === "http:" || u.protocol === "https:") ? u.href : null;
        } catch (_) {
            return null;
        }
    }

    function addMessage(role, text, sources, handoff, isHtml) {
        const stickToBottom = role === "user" || isNearBottom();
        const div = document.createElement("div");
        div.className = "coach-msg coach-msg-" + (role === "user" ? "user" : "ai") + (role === "system" ? " coach-msg-system" : "");
        if (isHtml) {
            // Trusted content only (welcome messages from our own JSON).
            // renderWelcomeHtml escapes all HTML first, then applies **em** and \n→<br>.
            div.innerHTML = text;
        } else {
            // Only filter AI-authored text — never alter what the user typed.
            const displayText = role === "user" ? text : stripTimestampMarkers(text);
            if (role === "user") {
                // Shift+Enter newlines are shown as typed (white-space: pre-wrap).
                div.appendChild(linkifyText(displayText));
            } else {
                renderRichText(div, displayText);
            }
        }
        // Suppress sources and YouTube embeds on handoff messages — the
        // handoff flow has its own UI (clarifying message → notified
        // confirmation → video call link). Showing cited sources or video
        // embeds here is noise that the operator has explicitly asked to
        // remove.
        const isHandoff = !!(handoff && handoff.roomUrl);
        if (!isHandoff && sources && Array.isArray(sources) && sources.length > 0) {
            const srcDiv = document.createElement("div");
            srcDiv.className = "coach-sources";
            // Issue #324: sources are chips; those with a URL/path are links.
            const list = document.createElement("ul");
            list.className = "coach-source-list";
            list.setAttribute("aria-label", "Sources");
            sources
                .filter(s => s && typeof s === "object")
                .forEach(s => {
                    const label = s.title || s.path || "untitled";
                    const href = sourceHref(s);
                    const li = document.createElement("li");
                    let chip;
                    if (href) {
                        chip = document.createElement("a");
                        chip.href = href;
                        chip.target = "_blank";
                        chip.rel = "noopener noreferrer";
                    } else {
                        chip = document.createElement("span");
                    }
                    chip.className = "coach-source-chip";
                    chip.textContent = label;
                    li.appendChild(chip);
                    list.appendChild(li);
                });
            if (list.children.length > 0) {
                srcDiv.appendChild(list);
                div.appendChild(srcDiv);
            }
        }
        // Playable video detection (ticket #008 Phase 2, Option A).
        // "youtubeUrl" is treated as a generic "playable video" field name —
        // it may hold a YouTube, Zoom, or other video URL. Accept videoUrl
        // as a forward-compatible alias (issue #017: non-YouTube videos in
        // the corpus). YouTube URLs get responsive iframe embeds; other
        // video URLs get a "▶ Play video" link that deep-links to the
        // timestamp. Phase 3 (ticket #011): if a source has
        // <!-- t=HH:MM:SS --> timestamp markers in its text, the embed/link
        // deep-links to that moment.
        // Skipped for handoff messages — videos are noise during handoff.
        if (role === "ai" && !isHandoff) {
            const videoIds = new Set();
            // Map: videoId → earliest start seconds (for deep-linking)
            const videoStartSeconds = new Map();
            // Non-YouTube video URLs that get a "Play video" link instead
            const otherVideoUrls = new Map(); // url → earliest startSeconds
            // From AI response text
            if (typeof text === "string") {
                extractYouTubeVideoIds(text).forEach(id => videoIds.add(id));
            }
            // From source youtubeUrl / videoUrl fields (backend sends these)
            if (sources && Array.isArray(sources)) {
                sources.forEach(s => {
                    const url = (s && (s.videoUrl || s.youtubeUrl)) || null;
                    if (s && url) {
                        const ytIds = extractYouTubeVideoIds(url);
                        if (ytIds.length > 0) {
                            ytIds.forEach(id => {
                                videoIds.add(id);
                                // Phase 3: the backend resolves the timestamp from the
                                // chunk's <!-- t=HH:MM:SS --> marker and sends it as
                                // startSeconds. Several sources can cite the same video;
                                // keep the earliest moment.
                                const ts = s.startSeconds;
                                if (typeof ts === "number" && isFinite(ts) && ts >= 0) {
                                    const existing = videoStartSeconds.get(id);
                                    if (existing === undefined || ts < existing) {
                                        videoStartSeconds.set(id, ts);
                                    }
                                }
                            });
                        } else {
                            // Non-YouTube video URL — show a "Play video" link
                            const ts = s.startSeconds;
                            const existing = otherVideoUrls.get(url);
                            if (existing === undefined || (typeof ts === "number" && ts < existing)) {
                                otherVideoUrls.set(url, typeof ts === "number" ? ts : 0);
                            }
                        }
                    }
                });
            }
            for (const videoId of videoIds) {
                const startSeconds = videoStartSeconds.get(videoId) || 0;
                const embedWrapper = createYouTubeEmbed(videoId, startSeconds);
                if (embedWrapper) div.appendChild(embedWrapper);
            }
            for (const [url, startSeconds] of otherVideoUrls) {
                const linkWrapper = createVideoLink(url, startSeconds);
                if (linkWrapper) div.appendChild(linkWrapper);
            }
        }
        // Feedback controls (thumbs up/down) after AI messages
        if (role === "ai" && !isHandoff) {
            appendFeedbackControls(div);
        }
        if (isHandoff) {
            // Handoff flow: instead of immediately showing the video call
            // link, ask the user if they want to add a clarifying message.
            // After they submit (or skip), show "We've been notified" and
            // the video call link.
            appendHandoffClarifyForm(div, handoff);
        }
        messagesDiv.appendChild(div);
        // Enrich link placeholders with OG metadata cards (issue #217).
        // Only for AI messages — user messages don't need link cards.
        if (role === "ai") {
            enrichLinkCards(div);
        }
        if (stickToBottom) {
            scrollToLatest();
        }
        updateJumpButton();
        return div;
    }

    // --- Handoff clarifying message flow ---
    // When the AI hands off to a human coach, the backend has already
    // created the handoff record and notified the coach group via Pub/Sub.
    // The frontend asks the user if they want to add a clarifying message,
    // then confirms "We've been notified" with the video call link.
    function appendHandoffClarifyForm(msgDiv, handoff) {
        const wrapper = document.createElement("div");
        wrapper.className = "coach-handoff-clarify";

        const prompt = document.createElement("p");
        prompt.className = "coach-handoff-clarify-prompt";
        prompt.textContent = "Would you like to add any message to clarify your question?";
        wrapper.appendChild(prompt);

        const textarea = document.createElement("textarea");
        textarea.className = "coach-handoff-clarify-input";
        textarea.placeholder = "Add context for the human coach (optional)...";
        textarea.maxLength = 2000;
        textarea.rows = 3;
        wrapper.appendChild(textarea);

        const btnRow = document.createElement("div");
        btnRow.className = "coach-handoff-clarify-btns";

        const sendBtn = document.createElement("button");
        sendBtn.type = "button";
        sendBtn.className = "btn btn-primary coach-handoff-clarify-send";
        sendBtn.textContent = "Send to coach";
        btnRow.appendChild(sendBtn);

        const skipLink = document.createElement("button");
        skipLink.type = "button";
        skipLink.className = "coach-handoff-clarify-skip";
        skipLink.textContent = "No thanks";
        btnRow.appendChild(skipLink);

        wrapper.appendChild(btnRow);
        msgDiv.appendChild(wrapper);

        function showNotified() {
            wrapper.remove();
            const notifiedDiv = document.createElement("div");
            notifiedDiv.className = "coach-handoff-notice";
            const confirmed = document.createElement("p");
            confirmed.className = "coach-handoff-notified";
            confirmed.textContent = "We've been notified. A coach will reach out to you.";
            notifiedDiv.appendChild(confirmed);
            const link = document.createElement("a");
            link.href = handoff.roomUrl;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = "Join the video call with a human coach";
            notifiedDiv.appendChild(link);
            const expiryNote = document.createElement("div");
            expiryNote.className = "coach-handoff-expiry";
            expiryNote.textContent = "This link expires when the coach joins or after 30 minutes. Do not share it.";
            notifiedDiv.appendChild(expiryNote);
            msgDiv.appendChild(notifiedDiv);
            if (isNearBottom()) scrollToLatest();
        }

        sendBtn.addEventListener("click", async () => {
            sendBtn.disabled = true;
            skipLink.disabled = true;
            const clarifyMsg = textarea.value.trim();
            if (clarifyMsg) {
                // Send the clarifying message to the backend so the coach
                // can see it in the session history. We use POST /v1/handoffs
                // which saves the message and publishes a new handoff event
                // with the additional context.
                try {
                    await fetchWithTimeout(API + "/v1/handoffs", {
                        method: "POST",
                        headers: authHeaders(),
                        body: JSON.stringify({
                            sessionId: currentSessionId || startNewSession(),
                            message: clarifyMsg,
                        }),
                    });
                } catch (err) {
                    // Even if the clarifying message fails to send, the
                    // original handoff is already created. Show the
                    // notified confirmation anyway.
                    console.warn("handoff clarify send failed:", err);
                }
            }
            showNotified();
        });

        skipLink.addEventListener("click", () => {
            showNotified();
        });
    }

    // --- Feedback controls (thumbs up / comment / thumbs down) ---
    // Per NN/g guidelines: lightweight, contextual, after meaningful answers.
    // Three-icon row: 👍 (helpful) — 🖐️ (comment) — 👎 (off-base)
    // Clicking a thumb submits the label and opens a context-aware comment prompt.
    // The comment icon opens a comment field using the selected thumb's prompt
    // (or a generic prompt if no thumb is selected yet).

    const FB_PROMPTS = {
        helpful: "Can you say what specifically you liked?",
        off_base: "What would you like us to improve?",
        generic: "Add a comment (optional)",
    };

    function appendFeedbackControls(msgDiv) {
        const fbRow = document.createElement("div");
        fbRow.className = "coach-feedback-row";
        fbRow.dataset.selectedLabel = "";
        // Capture welcome variation ID from the parent message div (issue #257)
        const welcomeVariationId = msgDiv.dataset.welcomeVariation || "";
        fbRow.setAttribute("role", "group");
        fbRow.setAttribute("aria-label", "Rate this response");
        // Issue #323: SVG icons (SF-Symbol style) instead of emoji, each with an
        // accessible name. Static markup only; nothing model-authored is used.
        const SVG_OPEN = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
        const options = [
            { icon: SVG_OPEN + '<path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>', value: "helpful", title: "Helpful" },
            { icon: SVG_OPEN + '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>', value: "comment", title: "Add a comment" },
            { icon: SVG_OPEN + '<path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg>', value: "off_base", title: "Not helpful" },
        ];
        options.forEach(fb => {
            const chip = document.createElement("button");
            chip.className = "coach-fb-chip";
            if (fb.value === "comment") chip.classList.add("coach-fb-chip--comment");
            chip.innerHTML = fb.icon;
            chip.title = fb.title;
            chip.setAttribute("aria-label", fb.title);
            if (fb.value !== "comment") chip.setAttribute("aria-pressed", "false");
            chip.type = "button";
            chip.addEventListener("click", () => {
                if (fb.value === "comment") {
                    const sel = fbRow.dataset.selectedLabel || "generic";
                    showFeedbackDetail(fbRow, sel);
                    return;
                }
                fbRow.querySelectorAll(".coach-fb-chip").forEach(c => {
                    if (!c.classList.contains("coach-fb-chip--comment")) {
                        c.classList.remove("coach-fb-selected");
                        c.setAttribute("aria-pressed", "false");
                    }
                });
                chip.classList.add("coach-fb-selected");
                chip.setAttribute("aria-pressed", "true");
                fbRow.dataset.selectedLabel = fb.value;
                submitFeedback(fb.value, undefined, welcomeVariationId);
                showFeedbackDetail(fbRow, fb.value);
            });
            fbRow.appendChild(chip);
        });
        msgDiv.appendChild(fbRow);
    }

    function showFeedbackDetail(fbRow, promptKey) {
        hideFeedbackDetail(fbRow);
        const detail = document.createElement("div");
        detail.className = "coach-fb-detail";
        const prompt = document.createElement("span");
        prompt.className = "coach-fb-detail-prompt";
        prompt.textContent = FB_PROMPTS[promptKey] || FB_PROMPTS.generic;
        const input = document.createElement("input");
        input.type = "text";
        input.placeholder = "Type your comment…";
        input.maxLength = 500;
        input.className = "coach-fb-detail-input";
        input.setAttribute("aria-label", "Your comment");
        const submit = document.createElement("button");
        submit.type = "button";
        submit.textContent = "Send";
        submit.className = "coach-fb-detail-submit";
        const label = fbRow.dataset.selectedLabel || "helpful";
        // Inherit welcome variation ID from the parent message div (issue #257)
        const msgDiv = fbRow.closest(".coach-message, .message, [data-welcome-variation]");
        const welcomeVariationId = (msgDiv && msgDiv.dataset.welcomeVariation) || "";
        submit.addEventListener("click", () => {
            if (input.value.trim()) {
                submitFeedback(label, input.value.trim(), welcomeVariationId);
            }
            detail.remove();
        });
        input.addEventListener("keydown", e => {
            if (e.key === "Enter") submit.click();
        });
        detail.appendChild(prompt);
        detail.appendChild(input);
        detail.appendChild(submit);
        fbRow.appendChild(detail);
        input.focus();
    }

    function hideFeedbackDetail(fbRow) {
        const existing = fbRow.querySelector(".coach-fb-detail");
        if (existing) existing.remove();
    }

    async function submitFeedback(label, note, welcomeVariationId) {
        try {
            const body = { sessionId: currentSessionId || SESSION.id || "", messageId: "", label };
            if (note) body.note = note;
            if (welcomeVariationId) body.welcomeVariationId = welcomeVariationId;
            await fetch(API + "/v1/feedback", {
                method: "POST",
                headers: authHeaders(),
                body: JSON.stringify(body),
            });
        } catch (e) {
            console.warn("coach-chat: feedback submission failed", e);
        }
    }

    // --- YouTube embed helpers (ticket #008 Phase 2, Option A) ---

    // Extract unique YouTube video IDs from a text string.
    // Matches:
    //   https://www.youtube.com/watch?v=VIDEO_ID
    //   https://youtu.be/VIDEO_ID
    //   https://www.youtube.com/embed/VIDEO_ID
    // Video IDs are 11 chars: [A-Za-z0-9_-]
    function extractYouTubeVideoIds(text) {
        const ids = new Set();
        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/g,
        ];
        for (const re of patterns) {
            let match;
            while ((match = re.exec(text)) !== null) {
                ids.add(match[1]);
            }
        }
        return Array.from(ids);
    }

    // Create a responsive YouTube iframe embed wrapper.
    // Uses youtube-nocookie.com for privacy (no cookies until play).
    // startSeconds (optional, ticket #011 Phase 3): deep-links the embed to
    // the given timestamp via &t=SECONDS.
    function createYouTubeEmbed(videoId, startSeconds) {
        const wrapper = document.createElement("div");
        wrapper.className = "coach-video-embed";
        const iframe = document.createElement("iframe");
        iframe.width = "100%";
        iframe.height = "315";
        let src = "https://www.youtube-nocookie.com/embed/" + videoId + "?rel=0";
        if (startSeconds && startSeconds > 0) {
            src += "&start=" + startSeconds;
        }
        iframe.src = src;
        iframe.title = "YouTube video player";
        iframe.setAttribute("frameborder", "0");
        iframe.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");
        iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
        iframe.setAttribute("allowfullscreen", "");
        iframe.loading = "lazy";
        wrapper.appendChild(iframe);
        // Phase 3: add "Jump to this moment" link below the embed when deep-linked
        if (startSeconds && startSeconds > 0) {
            const jumpLink = document.createElement("a");
            jumpLink.href = "https://www.youtube.com/watch?v=" + videoId + "&t=" + startSeconds + "s";
            jumpLink.target = "_blank";
            jumpLink.rel = "noopener noreferrer";
            jumpLink.className = "coach-video-jump-link";
            const mins = Math.floor(startSeconds / 60);
            const secs = startSeconds % 60;
            jumpLink.textContent = "▶ Jump to " + mins + ":" + (secs < 10 ? "0" : "") + secs;
            wrapper.appendChild(jumpLink);
        }
        return wrapper;
    }

    // Create a "▶ Play video" link for non-YouTube video URLs (Zoom
    // recordings, local video files, etc. — issue #017). Deep-links to
    // the timestamp via &t=SECONDS or ?t=SECONDS depending on the URL.
    function createVideoLink(url, startSeconds) {
        const wrapper = document.createElement("div");
        wrapper.className = "coach-video-link";
        const link = document.createElement("a");
        let href = url;
        if (startSeconds && startSeconds > 0) {
            href += (href.includes("?") ? "&" : "?") + "t=" + startSeconds + "s";
        }
        link.href = href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.className = "coach-video-play-link";
        link.textContent = "▶ Play video";
        wrapper.appendChild(link);
        return wrapper;
    }

    // --- Init chat UI ---
    let userMessageCount = 0;

    // keepSessions: "New chat" leaves the conversation picker as it was; "Clear"
    // and the environment switch reset it (their sessions belong elsewhere).
    // convoGen changes whenever the visible conversation is replaced. Late async
    // work (the doku-of-the-hour bubble) checks it so it cannot land in a
    // conversation the user has since undone/switched away from.
    let convoGen = 0;
    async function showFreshConversation(keepSessions) {
        const gen = ++convoGen;
        currentSessionId = "";
        clearMessageNodes();
        setEmptyState(true);
        userMessageCount = 0;
        const welcomeHtml = await loadWelcomeVariation();
        const welcomeDiv = addMessage("ai", welcomeHtml, undefined, undefined, true);
        // Tag the welcome message so feedback on it includes the variation ID
        if (welcomeDiv) welcomeDiv.dataset.welcomeVariation = currentWelcomeId;
        // A fresh conversation reads from the top (empty-state card first).
        if (messagesDiv) messagesDiv.scrollTop = 0;
        updateJumpButton();
        showDokuOfTheHour(gen);
        renderSessionList(keepSessions ? knownSessions : [], "");
    }

    function sessionOptionText(session) {
        if (session && session.label) return session.label;
        if (session && session.id) return session.id;
        return "Conversation";
    }

    let knownSessions = [];
    function renderSessionList(sessions, selectedId) {
        knownSessions = sessions;
        if (!sessionSelect) return;
        sessionSelect.innerHTML = "";
        const emptyOption = document.createElement("option");
        emptyOption.value = "";
        emptyOption.textContent = "New conversation";
        sessionSelect.appendChild(emptyOption);
        for (const session of sessions) {
            if (!session || !session.id) continue;
            const option = document.createElement("option");
            option.value = session.id;
            option.textContent = sessionOptionText(session);
            option.selected = session.id === selectedId;
            sessionSelect.appendChild(option);
        }
    }

    async function loadSessionMessages(sessionId) {
        const messagesResp = await fetchWithTimeout(
            API + "/v1/sessions/" + encodeURIComponent(sessionId) + "/messages",
            { headers: authHeaders() },
            { timeoutMs: 8000, retries: 0, slowNotice: false }
        );
        if (!messagesResp.ok) throw new Error("session messages returned " + messagesResp.status);
        const messageData = await messagesResp.json();
        const messages = Array.isArray(messageData.messages) ? messageData.messages : [];
        convoGen++;
        clearMessageNodes();
        setEmptyState(false);
        userMessageCount = 0;
        for (const message of messages) {
            if (!message || typeof message.text !== "string") continue;
            const role = message.role === "user" ? "user" : "ai";
            addMessage(role, message.text, message.sources || message.corpusSources);
            if (role === "user") userMessageCount++;
        }
        scrollToLatest();
        updateJumpButton();
    }

    async function switchSession(sessionId) {
        hideToast(); // a pending Undo refers to the conversation being left
        if (!sessionId) {
            sessionStorage.removeItem(CHAT_SESSION_KEY);
            await showFreshConversation();
            return;
        }
        await loadSessionMessages(sessionId);
        currentSessionId = sessionId;
        sessionStorage.setItem(CHAT_SESSION_KEY, currentSessionId);
    }

    if (sessionSelect) {
        sessionSelect.addEventListener("change", () => switchSession(sessionSelect.value));
    }

    async function restoreConversation() {
        try {
            const recentResp = await fetchWithTimeout(
                API + "/v1/sessions/recent?limit=20",
                { headers: authHeaders() },
                { timeoutMs: 8000, retries: 0, slowNotice: false }
            );
            if (!recentResp.ok) throw new Error("recent sessions returned " + recentResp.status);
            const recentData = await recentResp.json();
            const sessions = Array.isArray(recentData.sessions) ? recentData.sessions : [];
            const storedSession = sessions.find(session => session && session.id === currentSessionId);
            const sessionToRestore = storedSession || (!currentSessionId && sessions.length > 0 ? sessions[0] : null);

            if (!sessionToRestore) {
                await showFreshConversation();
                return;
            }

            await switchSession(sessionToRestore.id);
            renderSessionList(sessions, currentSessionId);
        } catch (err) {
            console.error("coach-chat: could not restore conversation; starting fresh:", err);
            sessionStorage.removeItem(CHAT_SESSION_KEY);
            await showFreshConversation();
        }
    }

    async function enterChat() {
        if (userInfo) userInfo.textContent = SESSION.email ? ("Signed in as " + SESSION.email) : "";
        const userNameEl = document.getElementById("coach-user-name");
        const userAvatarEl = document.getElementById("coach-user-avatar");
        if (SESSION.email) {
            const shortName = SESSION.email.split("@")[0];
            if (userNameEl) userNameEl.textContent = shortName;
            if (userAvatarEl) userAvatarEl.textContent = shortName.charAt(0).toUpperCase();
        }
        updateEnvUI();
        await restoreConversation();
    }

    // Issue #236: fetch the rotating "doku of the hour" — a real excerpt
    // from the corpus, refreshed once per hour — and show it as a second
    // welcome bubble. Best-effort: the chat works fine without it, so a
    // failure here is logged and swallowed rather than shown to the user.
    async function showDokuOfTheHour(gen) {
        try {
            const resp = await fetchWithTimeout(API + "/v1/doku/current", { headers: authHeaders() });
            if (!resp.ok) {
                console.error("coach-chat: doku of the hour request failed with status", resp.status);
                return;
            }
            const data = await resp.json();
            if (data && data.excerpt && gen === convoGen) {
                addMessage("ai", data.excerpt);
            }
        } catch (err) {
            console.error("coach-chat: could not load doku of the hour:", err);
        }
    }

    // --- Short-message gate (start of conversation) ---
    // At the start of a conversation (before the first real question),
    // brief greetings or acknowledgments (< 5 words) get a lightweight
    // client-side response instead of hitting the backend. This avoids
    // wasting an LLM call + corpus retrieval on "hi", "thanks", "ok", etc.
    function isShortOpener(msg) {
        if (userMessageCount > 0) return false;
        const words = msg.trim().split(/\s+/).filter(Boolean);
        return words.length < 5;
    }

    function shortOpenerResponse(msg) {
        const lower = msg.toLowerCase().trim();
        // Greetings
        if (/^(hi|hello|hey|greetings|good (morning|afternoon|evening)|namaste|konnichiwa)\b/.test(lower)) {
            return "Hi! I'm Discussing The Unified Field. What would you like to explore? You can ask about a specific practice, a challenge you're working with, or anything from Richard Moon's teachings.";
        }
        // Acknowledgments
        if (/^(thanks|thank you|thx|cool|nice|great|ok|okay|sure|yes|yeah|yep)\b/.test(lower)) {
            return "You're welcome. What would you like to explore?";
        }
        // Very short vague questions
        if (/^(what|how|why|who|where|tell me|help)\b/.test(lower)) {
            return "Could you say a bit more about what you'd like to explore? For example, a specific practice, a challenge in your training, or a question about Richard Moon's teachings.";
        }
        // Default fallback for other short openers
        return "Could you tell me a bit more about what you'd like to explore? You can ask about a specific practice, a challenge you're working with, or anything from Richard Moon's teachings.";
    }

    // --- Logout ---
    if (logoutBtn) {
        logoutBtn.addEventListener("click", async () => {
            // Clear server-side session via login.php
            try {
                const loginUrl = '/login.php';
                await fetch(loginUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: "action=logout",
                });
            } catch (_) { /* best-effort */ }
            // Clear client-side state
            sessionStorage.removeItem("qa_email");
            sessionStorage.removeItem("qa_session_token");
            sessionStorage.removeItem("qa_session_expires");
            sessionStorage.removeItem("qa_target_env");
            sessionStorage.removeItem("qa_selected_env");
            sessionStorage.removeItem(CHAT_SESSION_KEY);
            currentSessionId = "";
            // Redirect to login
            window.location.href = '/login.php?next=' + encodeURIComponent(window.location.pathname);
        });
    }

    // --- Clear conversation / New chat (issues #17, #324) ---
    // Forgiveness pattern: no confirm dialog. Clear and New chat act at once and
    // show a 5-second "Undo" toast (role=status) that puts the previous
    // conversation back: message nodes, session id, message count and picker.
    // (We picked undo over confirm because Clear only detaches this browser
    // tab from the server-side session, so restoring is lossless.)
    const UNDO_MS = 5000;
    let undoSnapshot = null;
    let undoTimer = null;

    function hideToast() {
        if (undoTimer) { clearTimeout(undoTimer); undoTimer = null; }
        undoSnapshot = null;
        if (toastEl) toastEl.hidden = true;
    }

    function showUndoToast(message, snapshot) {
        if (!toastEl || !toastMsg) return;
        if (undoTimer) clearTimeout(undoTimer);
        undoSnapshot = snapshot;
        toastMsg.textContent = message;
        toastEl.hidden = false;
        undoTimer = setTimeout(hideToast, UNDO_MS);
    }

    function snapshotConversation() {
        return {
            nodes: Array.from(messagesDiv.children).filter(function(n) {
                // Skip the intro card (kept) and a transient "Harmonizing"
                // spinner — restoring one would freeze it in place forever.
                return n !== introPanel && !n.classList.contains("coach-harmonizing");
            }),
            wasEmpty: messagesDiv.classList.contains("is-empty"),
            sessionId: currentSessionId,
            userMessageCount: userMessageCount,
            sessions: knownSessions,
        };
    }

    function restoreSnapshot(snap) {
        convoGen++;
        clearMessageNodes();
        snap.nodes.forEach(function(n) { messagesDiv.appendChild(n); });
        setEmptyState(snap.wasEmpty);
        currentSessionId = snap.sessionId;
        userMessageCount = snap.userMessageCount;
        if (currentSessionId) sessionStorage.setItem(CHAT_SESSION_KEY, currentSessionId);
        else sessionStorage.removeItem(CHAT_SESSION_KEY);
        renderSessionList(snap.sessions, currentSessionId);
        scrollToLatest();
        updateJumpButton();
    }

    let freshPending = false;
    async function startFreshWithUndo(message, keepSessions) {
        // A second Clear/New chat while the first is still starting (or while
        // its Undo toast is up) would snapshot the already-emptied list and
        // overwrite the only snapshot that can bring the conversation back.
        // Likewise, while a reply is in flight a Clear would orphan the
        // "Harmonizing" node into the snapshot and let the late reply land in
        // the wrong conversation (#330) — wait for the reply instead.
        if (freshPending || sending) return;
        freshPending = true;
        try {
            if (navigator.vibrate) navigator.vibrate(10);
            const snap = undoSnapshot || snapshotConversation();
            sessionStorage.removeItem(CHAT_SESSION_KEY);
            currentSessionId = "";
            if (queueBanner) queueBanner.hidden = true;
            // showFreshConversation() removes the old nodes; we hold them in `snap`.
            await showFreshConversation(keepSessions);
            showUndoToast(message, snap);
        } finally {
            freshPending = false;
        }
    }

    if (toastUndoBtn) {
        toastUndoBtn.addEventListener("click", function() {
            const snap = undoSnapshot;
            hideToast();
            if (snap) restoreSnapshot(snap);
            if (chatInput) chatInput.focus();
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener("click", function() {
            startFreshWithUndo("Conversation cleared", false);
        });
    }
    if (newChatBtn) {
        newChatBtn.addEventListener("click", function() {
            startFreshWithUndo("Started a new chat", true).then(function() {
                if (chatInput && window.matchMedia("(pointer: fine)").matches) chatInput.focus();
            });
        });
    }

    // --- Environment toggle ---
    if (envToggle) {
        envToggle.addEventListener("click", () => {
            if (FORCE_STAGING) return;
            selectedEnv = selectedEnv === "production" ? "staging" : "production";
            setEnvState(targetEnvironment, selectedEnv);
            updateEnvUI();
            hideToast(); // Undo belongs to the environment being left
            sessionStorage.removeItem(CHAT_SESSION_KEY);
            currentSessionId = "";
            showFreshConversation();
        });
    }

    // --- Chat form ---
    // Composer state (issue #324): sending disables the send button (and
    // ignores Enter); an empty field also disables it.
    let sending = false;
    function updateSendButton() {
        if (sendBtn) sendBtn.disabled = sending || !chatInput.value.trim();
    }
    function setSending(value) {
        sending = value;
        updateSendButton();
    }
    function removeHarmonizing(el) {
        el.remove();
        if (messagesDiv) messagesDiv.setAttribute("aria-busy", "false");
    }

    if (chatForm) {
        chatForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const msg = chatInput.value.trim();
            if (!msg || sending) return;
            if (navigator.vibrate) navigator.vibrate(15);
            hideToast(); // a pending "Undo" no longer applies once the user types on
            setEmptyState(false);
            addMessage("user", msg);
            chatInput.value = "";
            updateComposerState(); // count, height (back to one row), send button
            userMessageCount++;
            setSending(true);
            // #330/#340: if the conversation is replaced (undo, session or env
            // switch) while the reply is in flight, the reply belongs to the
            // old conversation — drop it rather than land it in the new one.
            const gen = convoGen;

            // Short-message gate: at the start of a conversation, brief
            // greetings/acknowledgments (< 5 words) get a client-side
            // response without hitting the backend.
            if (isShortOpener(msg)) {
                const shortAnswer = shortOpenerResponse(msg);
                const aiMsgDiv = addMessage("ai", shortAnswer);
                setSending(false);
                return;
            }

            // Show a subtle "Harmonizing..." indicator so the user knows
            // their message was received while the backend processes it.
            const harmonizingEl = document.createElement("div");
            harmonizingEl.className = "coach-msg coach-msg-ai coach-harmonizing";
            harmonizingEl.innerHTML = '<span class="coach-harmonizing-dots">Harmonizing</span>';
            messagesDiv.appendChild(harmonizingEl);
            messagesDiv.setAttribute("aria-busy", "true"); // issue #324
            scrollToLatest(); // the user just sent: always follow

            try {
                const resp = await fetchWithTimeout(API + "/v1/chat-secure", {
                    method: "POST",
                    headers: authHeaders(),
                    body: JSON.stringify({
                        message: msg,
                        // Issue #731: let the backend mint the session id for
                        // the first message so it can generate and persist the
                        // conversation label. After the first response we use
                        // the returned sessionId.
                        sessionId: currentSessionId || null,
                        // Issue #184: If profile hasn't loaded yet, send null so
                        // backend falls back to durable preferredLanguage.
                        // Once loaded (or user selected), explicitly send selectedLanguage.
                        language: profileLoaded ? selectedLanguage : (selectedLanguage === "en" ? null : selectedLanguage),
                    }),
                }, { timeoutMs: 45000, retries: 1 });

                if (resp.status === 401) {
                    removeHarmonizing(harmonizingEl);
                    // Session expired — redirect to login
                    window.location.href = '/login.php?error=session_expired&next=' + encodeURIComponent(window.location.pathname);
                    return;
                }

                if (resp.status === 429) {
                    removeHarmonizing(harmonizingEl);
                    let data;
                    try { data = await resp.json(); } catch (_) { data = {}; }
                    queueBanner.hidden = false;
                    queueBanner.textContent = (data && data.detail) || httpErrorMessage(429);
                    setSending(false);
                    return;
                }

                if (resp.status >= 400) {
                    removeHarmonizing(harmonizingEl);
                    // Degraded mode (issue #200) now returns 200 with a full
                    // ChatResponse, so it no longer arrives as 503. A 503 here
                    // is a real error (billing-denied or genuinely unavailable).
                    if (resp.status === 503) {
                        let errData;
                        try { errData = await resp.json(); } catch (_) { errData = {}; }
                        addMessage("system", (errData && errData.detail) || httpErrorMessage(503));
                        setSending(false);
                        return;
                    }
                    addMessage("system", httpErrorMessage(resp.status));
                    setSending(false);
                    return;
                }

                const data = await resp.json();
                const valid = validateChatResponse(data);
                if (!valid) {
                    removeHarmonizing(harmonizingEl);
                    addMessage("system", "I received an unexpected response. Please try again.");
                    setSending(false);
                    return;
                }
                removeHarmonizing(harmonizingEl);
                if (gen !== convoGen) {
                    setSending(false);
                    return;
                }
                queueBanner.hidden = true;
                // Issue #731: adopt the backend's session id on the first turn
                // and refresh the conversation picker so the new label appears.
                if (valid.sessionId && valid.sessionId !== currentSessionId) {
                    currentSessionId = valid.sessionId;
                    sessionStorage.setItem(CHAT_SESSION_KEY, currentSessionId);
                    try {
                        const recentResp = await fetchWithTimeout(
                            API + "/v1/sessions/recent?limit=20",
                            { headers: authHeaders() },
                            { timeoutMs: 5000, retries: 0, slowNotice: false }
                        );
                        if (recentResp.ok) {
                            const recentData = await recentResp.json();
                            const sessions = Array.isArray(recentData.sessions) ? recentData.sessions : [];
                            renderSessionList(sessions, currentSessionId);
                        }
                    } catch (_) {
                        // Picker refresh is best-effort.
                    }
                }
                // Degraded mode (issue #200): Gemini is unavailable and the
                // question was saved server-side. Show the message as a system
                // notice rather than a bot answer.
                if (valid.degraded) {
                    addMessage("system", valid.response || "The coaching service is temporarily unavailable. Your question has been saved and will be answered when service resumes.");
                    setSending(false);
                    return;
                }
                const handoff = valid.intent === "handoff" && valid.roomUrl
                    ? { roomUrl: valid.roomUrl, handoffId: valid.handoffId }
                    : null;
                const aiMsgDiv = addMessage("ai", valid.response || "I couldn't generate a response.", valid.sources, handoff);
            } catch (err) {
                removeHarmonizing(harmonizingEl);
                const msg = err && err.name === "AbortError"
                    ? "The request timed out. The coach may be busy — please try again."
                    : friendlyErrorMessage(err);
                addMessage("system", msg);
            }
            setSending(false);
        });
    }

    // --- Composer: Return sends, Shift+Return newline, autosize (issue #324) ---
    // Return (no Shift) submits; Shift+Return inserts a newline. Keys pressed
    // while an IME composition is active (e.isComposing / keyCode 229) belong to
    // the IME (candidate selection in CJK etc.) and must never send.
    // The field starts at one row and grows to COMPOSER_MAX_ROWS on every
    // viewport, then scrolls internally.
    const COMPOSER_MAX_ROWS = 6;
    const COUNTER_SHOW_AT = 3600; // show the counter within 10% of the 4000 limit
    const counterEl = charCount ? charCount.parentElement : null;

    function autosizeChatInput() {
        if (!chatInput) return;
        chatInput.style.height = "auto";
        const cs = window.getComputedStyle(chatInput);
        let line = parseFloat(cs.lineHeight);
        if (!isFinite(line)) line = (parseFloat(cs.fontSize) || 16) * 1.4;
        const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
        const border = (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
        const max = Math.round(line * COMPOSER_MAX_ROWS + pad + border);
        const needed = chatInput.scrollHeight + border;
        chatInput.style.height = Math.min(needed, max) + "px";
        chatInput.style.overflowY = needed > max ? "auto" : "hidden";
    }

    function updateComposerState() {
        const len = chatInput.value.length;
        if (charCount) charCount.textContent = len;
        if (counterEl) {
            counterEl.hidden = len < COUNTER_SHOW_AT;
            counterEl.classList.toggle("over-limit", len >= COUNTER_SHOW_AT);
        }
        autosizeChatInput();
        updateSendButton();
    }

    if (chatInput) {
        chatInput.addEventListener("input", updateComposerState);
        // Touch keyboards have no Shift key, so Return-to-send leaves no way
        // to type a newline (#339): on coarse pointers Return stays a newline
        // and the Send button sends. Desktop keeps Return = send.
        const coarsePointer = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
        chatInput.addEventListener("keydown", (e) => {
            if (e.key !== "Enter" || e.shiftKey) return;
            if (e.isComposing || e.keyCode === 229) return; // IME in progress
            if (coarsePointer) return;
            e.preventDefault();
            if (sending || !chatInput.value.trim()) return;
            // requestSubmit is Safari 16+. On older iOS it is undefined,
            // so Enter-to-send would throw and silently drop the message.
            if (typeof chatForm.requestSubmit === "function") {
                chatForm.requestSubmit();
            } else {
                chatForm.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
            }
        });
        window.addEventListener("resize", autosizeChatInput);
    }

    // --- Start ---
    updateComposerState();

    // Measure the actual sticky header height and expose it as --nav-h so the
    // CSS calc for .coach-shell min-height doesn't rely on a hardcoded 70px.
    // header[role="banner"] is the site header (#339); wrapped in try/catch so
    // it can never take the chat down.
    try {
        const measureNav = () => {
            const nav = document.querySelector('header[role="banner"]');
            if (nav) {
                document.documentElement.style.setProperty("--nav-h", nav.offsetHeight + "px");
            }
        };
        measureNav();
        window.addEventListener("resize", measureNav);
        // The header can change height after first paint (web fonts, i18n
        // strings, nav wrap), which would push the pinned composer off screen.
        const navEl = document.querySelector('header[role="banner"]');
        if (navEl && typeof ResizeObserver === "function") {
            new ResizeObserver(measureNav).observe(navEl);
        }
    } catch (err) {
        console.warn("coach-chat: could not measure nav height:", err);
    }

    // Scroll-to-bottom button: shown when the user has scrolled up in the
    // messages area, hidden when at/near the bottom. A standard mobile chat
    // pattern — without it, users who scroll up to read older messages have
    // no quick way back to the latest message.
    try {
        const scrollBtn = document.getElementById("coach-scroll-bottom-btn");
        if (scrollBtn && messagesDiv) {
            messagesDiv.addEventListener("scroll", updateJumpButton);
            updateJumpButton();
            scrollBtn.addEventListener("click", () => {
                scrollToLatest();
                scrollBtn.hidden = true;
                if (navigator.vibrate) navigator.vibrate(10);
            });
        }
    } catch (err) {
        console.warn("coach-chat: could not init scroll-to-bottom button:", err);
    }

    // Issue #151: On-screen keyboard handling. When the soft keyboard opens
    // on iOS/Android it shrinks window.visualViewport.height. The CSS uses
    // 100dvh for the chat container (modern browsers shrink dvh automatically),
    // but older browsers (iOS <15.4, Android WebView) don't support dvh. This
    // visualViewport listener is a fallback: it sets a CSS custom property on
    // the chat card so the layout can shrink to fit the visible area, and
    // scrolls the latest message into view so it isn't hidden under the
    // keyboard. Feature-detected and wrapped in try/catch so it can never
    // take the chat down.
    try {
        const chatCard = document.getElementById("coach-chat");
        if (chatCard && window.visualViewport && typeof window.visualViewport.addEventListener === "function") {
            const syncViewport = () => {
                const vh = window.visualViewport.height;
                // Set on :root so .coach-shell (parent of #coach-chat) can
                // use var(--vvh, 100dvh) for its min-height (#151).
                document.documentElement.style.setProperty("--vvh", vh + "px");
                // Keep the newest message visible above the keyboard, unless
                // the reader has scrolled up on purpose (issue #324).
                if (messagesDiv && followBottom) scrollToLatest();
            };
            window.visualViewport.addEventListener("resize", syncViewport);
            window.visualViewport.addEventListener("scroll", syncViewport);
        }
    } catch (err) {
        console.warn("coach-chat: could not attach visualViewport listener:", err);
    }

    // Issue #184: populate the language selector from the backend
    initLanguageSelector();

    // Verify the session is still valid before entering chat.
    // The Pages Function checks this server-side, but the session could
    // expire between the page load and the first API call. Without this
    // check, the user sees "Harmonizing..." briefly then gets redirected
    // to login on their first message — erasing their typed text.
    // Use a short timeout (5s, no retries) to minimize the blank-page window.
    (async function verifySessionOnLoad() {
        try {
            const resp = await fetchWithTimeout(API + "/v1/auth/me", { headers: authHeaders() }, { timeoutMs: 5000, retries: 0, slowNotice: false });
            if (resp.status === 401) {
                console.warn("coach-chat: session expired on page load — redirecting to login");
                window.location.href = '/login.php?error=session_expired&next=' + encodeURIComponent(window.location.pathname);
                return;
            }
        } catch (err) {
            // Network error — don't block chat on a transient failure.
            // The chat send handler will catch a real 401 on the first message.
            console.error("coach-chat: auth/me check failed:", err);
        }
        enterChat();
    })();
})();

// ── User menu & Intro panel initialization ──────────────────────────────
(function initCoachUIEnhancements() {
    // Intro panel dismiss with localStorage persistence
    const introPanel = document.getElementById("coach-intro-panel");
    const dismissBtn = document.getElementById("coach-intro-dismiss");
    if (introPanel) {
        try {
            if (localStorage.getItem("qa_intro_dismissed") === "1") {
                introPanel.style.display = "none";
            }
        } catch (_) {}
        if (dismissBtn) {
            dismissBtn.addEventListener("click", function() {
                // Hiding the focused button would drop focus to <body>;
                // hand it to the composer instead (keyboard users only).
                // NB: this IIFE has no chatInput binding — look the element up.
                const hadFocus = document.activeElement === dismissBtn;
                introPanel.style.display = "none";
                try {
                    localStorage.setItem("qa_intro_dismissed", "1");
                } catch (_) {}
                const input = document.getElementById("coach-chat-input");
                if (hadFocus && input) input.focus();
            });
        }
    }

    // More (⋯) menu (issues #323/#324). WAI-ARIA menu-button pattern:
    //   trigger: Enter/Space/click opens (focus on first item); ArrowDown /
    //            ArrowUp open with focus on first / last item.
    //   menu:    ArrowDown/ArrowUp move (wrapping), Home/End jump, Escape
    //            closes and returns focus to the trigger, Tab closes, an
    //            outside click closes. aria-expanded mirrors the state.
    // The language <select> is a member of the roving set; Space/Enter opens
    // its native picker, arrow keys move between menu entries like the rest.
    const moreBtn = document.getElementById("coach-more-btn");
    const moreMenu = document.getElementById("coach-more-menu");
    if (moreBtn && moreMenu) {
        function menuEntries() {
            return Array.from(moreMenu.querySelectorAll('[role="menuitem"], select'))
                .filter(function(el) { return !el.disabled && !el.closest("[hidden]"); });
        }
        function focusEntry(index) {
            const list = menuEntries();
            if (!list.length) return;
            list[(index + list.length) % list.length].focus();
        }
        function setMenuOpen(open, returnFocus) {
            moreMenu.hidden = !open;
            moreBtn.setAttribute("aria-expanded", open ? "true" : "false");
            if (!open && returnFocus) moreBtn.focus();
        }

        moreBtn.addEventListener("click", function() {
            const open = moreMenu.hidden;
            setMenuOpen(open, false);
            if (open) focusEntry(0);
        });
        moreBtn.addEventListener("keydown", function(e) {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                setMenuOpen(true, false);
                focusEntry(e.key === "ArrowDown" ? 0 : -1);
            }
        });

        moreMenu.addEventListener("keydown", function(e) {
            const list = menuEntries();
            const idx = list.indexOf(document.activeElement);
            switch (e.key) {
                case "ArrowDown": e.preventDefault(); focusEntry(idx + 1); break;
                case "ArrowUp":   e.preventDefault(); focusEntry(idx < 0 ? -1 : idx - 1); break;
                case "Home":      e.preventDefault(); focusEntry(0); break;
                case "End":       e.preventDefault(); focusEntry(-1); break;
                case "Escape":    e.preventDefault(); setMenuOpen(false, true); break;
                case "Tab":       setMenuOpen(false, true); break; // default Tab then moves on from the trigger
                case " ":
                    // Links do not activate on Space natively; buttons do.
                    if (document.activeElement && document.activeElement.tagName === "A") {
                        e.preventDefault();
                        document.activeElement.click();
                    }
                    break;
            }
        });

        // Activating an entry closes the menu. The features entry opens its own
        // popover and manages focus itself; everything else returns to the trigger.
        moreMenu.addEventListener("click", function(e) {
            const item = e.target.closest('[role="menuitem"]');
            if (!item) return;
            setMenuOpen(false, item.id !== "coach-features-btn");
        });

        document.addEventListener("click", function(e) {
            if (moreMenu.hidden) return;
            if (!moreMenu.contains(e.target) && !moreBtn.contains(e.target)) {
                setMenuOpen(false, false);
            }
        });
    }
})();
