// Chat-only JS — AikiField projects.php (ported from quantumaikido.com
// members.php, issue #51). Identical chat behaviour; the login/logout URLs
// are read from window.COACH_LOGIN_URL / window.COACH_LOGOUT_URL (set by
// projects.php) so the same file works on either site.
// Reads the session from window.QA_SESSION (injected by PHP) instead of
// sessionStorage. Handles the chat UI only — login is handled by
// coach-login.js.
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
    };

    let targetEnvironment = FORCE_STAGING ? "staging" : (SESSION.targetEnv || "both");
    let selectedEnv = FORCE_STAGING ? "staging" : (sessionStorage.getItem("qa_selected_env") || "production");

    // --- DOM refs ---
    const messagesDiv    = document.getElementById("coach-messages");
    const chatForm       = document.getElementById("coach-chat-form");
    const chatInput      = document.getElementById("coach-chat-input");
    const sendBtn        = document.getElementById("coach-send-btn");
    const sendHint       = document.getElementById("coach-send-hint");
    const charCount      = document.getElementById("coach-char-count");
    const queueBanner    = document.getElementById("coach-queue-banner");
    const userInfo       = document.getElementById("coach-user-info");
    const logoutBtn      = document.getElementById("coach-logout");
    const clearBtn       = document.getElementById("coach-clear-btn");
    const languageSelect = document.getElementById("coach-language-select");

    // Issue #184: selected response language. "en" = auto-detect (no directive).
    let selectedLanguage = "en";

    // Environment toggle
    const envControls    = document.getElementById("coach-env-controls");
    const envToggle      = document.getElementById("coach-env-toggle");
    const envBanner      = document.getElementById("coach-env-banner");

    // Member-initiated handoff prompt (issue #103)
    const handoffPrompt   = document.getElementById("coach-handoff-prompt");
    const handoffTrigger  = document.getElementById("coach-handoff-trigger");
    const handoffForm     = document.getElementById("coach-handoff-form");
    const handoffQ2       = handoffForm ? handoffForm.querySelector(".coach-handoff-q2") : null;
    const handoffQ3       = handoffForm ? handoffForm.querySelector(".coach-handoff-q3") : null;
    const handoffQuestion = document.getElementById("coach-handoff-question");
    const handoffSubmit   = document.getElementById("coach-handoff-submit");
    const handoffCancel   = document.getElementById("coach-handoff-cancel");

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
        }
    }

    // Persist language preference on change (fire-and-forget)
    if (languageSelect) {
        languageSelect.addEventListener("change", function() {
            selectedLanguage = languageSelect.value;
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
                "Please report any issues to <a href=\"mailto:coach@quantumaikido.com\">coach@quantumaikido.com</a>. " +
                "<a href=\"/members.php\">Return to the live site</a>.";
        } else if (targetEnvironment === "both") {
            if (envControls) envControls.hidden = false;
            if (envToggle) envToggle.dataset.env = selectedEnv;
        } else if (targetEnvironment === "staging") {
            selectedEnv = "staging";
            envBanner.hidden = false;
            envBanner.innerHTML = "You're using the <strong>staging</strong> environment — help us test the latest features. " +
                "Your feedback is valuable! Please report any issues to <a href=\"mailto:coach@quantumaikido.com\">coach@quantumaikido.com</a>.";
        } else {
            selectedEnv = "production";
            envBanner.hidden = false;
            envBanner.innerHTML = "Want to help test new features before they go live? " +
                "Ask about getting access to our <strong>staging</strong> environment — " +
                "email <a href=\"mailto:coach@quantumaikido.com\">coach@quantumaikido.com</a> to volunteer.";
        }
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
        if (status === 401) return "Your session has expired. Please sign in again.";
        if (status === 403) return "You don't have permission to do that. Try signing in again.";
        if (status === 413) return "Your message is too long. Please shorten it to under 4,000 characters.";
        if (status === 429) return "The coach is busy with other members right now. Please wait a moment and try again.";
        if (status >= 500) return "The coaching service is temporarily unavailable. Please try again in a moment.";
        return fallback || "Something went wrong. Please try again.";
    }

    function validateChatResponse(data) {
        if (!data || typeof data !== "object") return null;
        const response = typeof data.response === "string" ? data.response : "";
        const sources = Array.isArray(data.sources) ? data.sources.filter(s => s && typeof s === "object") : [];
        const intent = data.intent === "handoff" ? "handoff" : "ai";
        const roomUrl = typeof data.roomUrl === "string" ? data.roomUrl : null;
        const handoffId = typeof data.handoffId === "string" ? data.handoffId : null;
        return { response, sources, intent, roomUrl, handoffId };
    }

    function addMessage(role, text, sources, handoff) {
        const div = document.createElement("div");
        div.className = "coach-msg coach-msg-" + (role === "user" ? "user" : "ai");
        div.textContent = text;
        // Suppress sources and YouTube embeds on handoff messages — the
        // handoff flow has its own UI (clarifying message → notified
        // confirmation → video call link). Showing cited sources or video
        // embeds here is noise that the operator has explicitly asked to
        // remove.
        const isHandoff = !!(handoff && handoff.roomUrl);
        if (!isHandoff && sources && Array.isArray(sources) && sources.length > 0) {
            const srcDiv = document.createElement("div");
            srcDiv.className = "coach-sources";
            const labels = sources
                .filter(s => s && typeof s === "object")
                .map(s => s.title || s.path || "untitled")
                .filter(Boolean);
            if (labels.length > 0) {
                srcDiv.textContent = "Sources: " + labels.join(", ");
                div.appendChild(srcDiv);
            }
        }
        // YouTube embed detection (ticket #008 Phase 2, Option A)
        // Scans the AI response text AND source youtubeUrl fields for YouTube
        // URLs and appends responsive iframe embeds below the message text.
        // Phase 3 (ticket #011): if a source has <!-- t=HH:MM:SS --> timestamp
        // markers in its text, the embed deep-links to that moment via &t=SECONDS.
        // Skipped for handoff messages — videos are noise during handoff.
        if (role === "ai" && !isHandoff) {
            const videoIds = new Set();
            // Map: videoId → earliest start seconds (for deep-linking)
            const videoStartSeconds = new Map();
            // From AI response text
            if (typeof text === "string") {
                extractYouTubeVideoIds(text).forEach(id => videoIds.add(id));
            }
            // From source youtubeUrl fields (backend now sends these)
            if (sources && Array.isArray(sources)) {
                sources.forEach(s => {
                    if (s && s.youtubeUrl) {
                        extractYouTubeVideoIds(s.youtubeUrl).forEach(id => {
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
                    }
                });
            }
            for (const videoId of videoIds) {
                const startSeconds = videoStartSeconds.get(videoId) || 0;
                const embedWrapper = createYouTubeEmbed(videoId, startSeconds);
                if (embedWrapper) div.appendChild(embedWrapper);
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
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
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
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
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
                            sessionId: "web_" + Date.now(),
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
        const options = [
            { label: "\u{1F44D}", value: "helpful", title: "Helpful" },
            { label: "\u{1F590}\u{FE0F}", value: "comment", title: "Add a comment" },
            { label: "\u{1F44E}", value: "off_base", title: "Off-base" },
        ];
        options.forEach(fb => {
            const chip = document.createElement("button");
            chip.className = "coach-fb-chip";
            if (fb.value === "comment") chip.classList.add("coach-fb-chip--comment");
            chip.textContent = fb.label;
            chip.title = fb.title;
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
                    }
                });
                chip.classList.add("coach-fb-selected");
                fbRow.dataset.selectedLabel = fb.value;
                submitFeedback(fb.value);
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
        const submit = document.createElement("button");
        submit.type = "button";
        submit.textContent = "Send";
        submit.className = "coach-fb-detail-submit";
        const label = fbRow.dataset.selectedLabel || "helpful";
        submit.addEventListener("click", () => {
            if (input.value.trim()) {
                submitFeedback(label, input.value.trim());
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

    async function submitFeedback(label, note) {
        try {
            const body = { sessionId: SESSION.id || "", messageId: "", label };
            if (note) body.note = note;
            await fetch(API + "/v1/feedback", {
                method: "POST",
                headers: authHeaders(),
                body: JSON.stringify(body),
            });
        } catch (_) {}
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

    // --- Init chat UI ---
    let userMessageCount = 0;

    function enterChat() {
        if (userInfo) userInfo.textContent = "Signed in as " + SESSION.email;
        if (messagesDiv) messagesDiv.innerHTML = "";
        userMessageCount = 0;
        updateEnvUI();
        addMessage("ai", "Welcome. I'm here as a guide grounded in the Quantum Aikido school. Care to describe your learning style? Don't worry — you can change it along the way.\n\nFYI, my dataset includes books, videos, and private coaching writings — How to get luckier!");
        showDokuOfTheHour();
    }

    // Issue #236: fetch the rotating "doku of the hour" — a real excerpt
    // from the corpus, refreshed once per hour — and show it as a second
    // welcome bubble. Best-effort: the chat works fine without it, so a
    // failure here is logged and swallowed rather than shown to the user.
    async function showDokuOfTheHour() {
        try {
            const resp = await fetchWithTimeout(API + "/v1/doku/current", { headers: authHeaders() });
            if (!resp.ok) {
                console.error("coach-chat: doku of the hour request failed with status", resp.status);
                return;
            }
            const data = await resp.json();
            if (data && data.excerpt) {
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
            return "Hi! What would you like to explore? You can ask about a specific practice, a challenge you're working with, or anything from Richard Moon's teachings.";
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
            // Clear server-side session via the login page (projects.php on
            // AikiField, login.php on QA). URL is injected by the page.
            const logoutUrl = window.COACH_LOGOUT_URL || (FORCE_STAGING ? '/staging/login.php' : '/login.php');
            const redirectUrl = window.COACH_LOGIN_URL || (FORCE_STAGING ? '/staging/login.php' : '/login.php');
            try {
                await fetch(logoutUrl, {
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
            // Redirect to login
            window.location.href = redirectUrl;
        });
    }

    // --- Clear conversation control (issue #17) ---
    if (clearBtn) {
        clearBtn.addEventListener("click", () => {
            if (navigator.vibrate) navigator.vibrate(10);
            messagesDiv.innerHTML = "";
            userMessageCount = 0;
            if (queueBanner) queueBanner.hidden = true;
            // Reset the handoff prompt: re-hide until the next message,
            // and clear any session dismissal so it can be offered again
            // in the fresh conversation (issue #103).
            handoffDismissed = false;
            resetHandoffForm();
            if (handoffTrigger) handoffTrigger.hidden = false;
            if (handoffPrompt) handoffPrompt.hidden = true;
            addMessage("ai", "Conversation cleared. Ask me anything about Sensei Richard Moon's teachings — his writings, recorded seminars, or conversations.");
        });
    }

    // --- Environment toggle ---
    if (envToggle) {
        envToggle.addEventListener("click", () => {
            if (FORCE_STAGING) return;
            selectedEnv = selectedEnv === "production" ? "staging" : "production";
            setEnvState(targetEnvironment, selectedEnv);
            updateEnvUI();
            messagesDiv.innerHTML = "";
            userMessageCount = 0;
            // Reset handoff prompt on environment switch (issue #103)
            handoffDismissed = false;
            resetHandoffForm();
            if (handoffTrigger) handoffTrigger.hidden = false;
            if (handoffPrompt) handoffPrompt.hidden = true;
            addMessage("ai", selectedEnv === "staging"
                ? "Switched to staging. This environment may have newer features that are still being tested."
                : "Switched to production.");
        });
    }

    // --- Chat form ---
    if (chatForm) {
        chatForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const msg = chatInput.value.trim();
            if (!msg) return;
            if (navigator.vibrate) navigator.vibrate(15);
            addMessage("user", msg);
            chatInput.value = "";
            charCount.textContent = "0";
            if (MOBILE_MQ.matches) autosizeChatInput(); // issue #154: shrink back to one row
            userMessageCount++;
            // Reveal the member-initiated handoff prompt once the member has
            // sent at least one message (issue #103).
            showHandoffPrompt();
            sendBtn.disabled = true;

            // Short-message gate: at the start of a conversation, brief
            // greetings/acknowledgments (< 5 words) get a client-side
            // response without hitting the backend.
            if (isShortOpener(msg)) {
                addMessage("ai", shortOpenerResponse(msg));
                sendBtn.disabled = false;
                return;
            }

            // Show a subtle "Harmonizing..." indicator so the user knows
            // their message was received while the backend processes it.
            const harmonizingEl = document.createElement("div");
            harmonizingEl.className = "coach-msg coach-msg-ai coach-harmonizing";
            harmonizingEl.innerHTML = '<span class="coach-harmonizing-dots">Harmonizing</span>';
            messagesDiv.appendChild(harmonizingEl);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;

            try {
                const resp = await fetchWithTimeout(API + "/v1/chat-secure", {
                    method: "POST",
                    headers: authHeaders(),
                    body: JSON.stringify({
                        message: msg,
                        sessionId: "web_" + Date.now(),
                        // Issue #184: send null for "en" (auto-detect) so the
                        // backend applies the user's durable preferredLanguage.
                        // This avoids a race where the profile hasn't loaded yet.
                        language: selectedLanguage === "en" ? null : selectedLanguage,
                    }),
                });

                if (resp.status === 401) {
                    harmonizingEl.remove();
                    // Session expired — redirect to login
                    window.location.href = (window.COACH_LOGIN_URL || (FORCE_STAGING ? '/staging/login.php' : '/login.php'))
                        + '?error=session_expired&redirect=' + encodeURIComponent(window.location.pathname);
                    return;
                }

                if (resp.status === 429) {
                    harmonizingEl.remove();
                    let data;
                    try { data = await resp.json(); } catch (_) { data = {}; }
                    queueBanner.hidden = false;
                    queueBanner.textContent = (data && data.detail) || httpErrorMessage(429);
                    sendBtn.disabled = false;
                    return;
                }

                if (resp.status >= 400) {
                    harmonizingEl.remove();
                    addMessage("ai", httpErrorMessage(resp.status));
                    sendBtn.disabled = false;
                    return;
                }

                const data = await resp.json();
                const valid = validateChatResponse(data);
                if (!valid) {
                    harmonizingEl.remove();
                    addMessage("ai", "I received an unexpected response. Please try again.");
                    sendBtn.disabled = false;
                    return;
                }
                harmonizingEl.remove();
                queueBanner.hidden = true;
                const handoff = valid.intent === "handoff" && valid.roomUrl
                    ? { roomUrl: valid.roomUrl, handoffId: valid.handoffId }
                    : null;
                addMessage("ai", valid.response || "I couldn't generate a response.", valid.sources, handoff);
            } catch (err) {
                harmonizingEl.remove();
                const msg = err && err.name === "AbortError"
                    ? "The request timed out. The coach may be busy — please try again."
                    : "Network error: " + (err && err.message ? err.message : "unknown") + ". Please try again.";
                addMessage("ai", msg);
            }
            sendBtn.disabled = false;
        });
    }

    // --- Character counter + double-Enter-to-send ---
    // First Enter (no Shift) shows a "Press Enter again to send" hint.
    // Second Enter within 3s sends. Typing more text resets the hint.
    // Shift+Enter always inserts a newline. Send button sends immediately.
    let enterPending = false;
    let enterTimeout = null;
    const ENTER_CONFIRM_MS = 3000;

    function clearEnterPending() {
        enterPending = false;
        if (enterTimeout) { clearTimeout(enterTimeout); enterTimeout = null; }
        if (sendHint) sendHint.hidden = true;
    }

    function showEnterHint() {
        enterPending = true;
        if (sendHint) sendHint.hidden = false;
        if (enterTimeout) clearTimeout(enterTimeout);
        enterTimeout = setTimeout(clearEnterPending, ENTER_CONFIRM_MS);
    }

    // Issue #154: mobile composer ergonomics. On touch-sized viewports the
    // textarea drops its desktop resize handle (CSS) and grows with content
    // via autosize, starting at one row. Gated to ≤768px so desktop is
    // materially unchanged (keeps rows=3 + resize: vertical + internal scroll).
    const MOBILE_MQ = window.matchMedia("(max-width: 768px)");
    const AUTOSIZE_CAP_PX = 128; // ~8rem
    function autosizeChatInput() {
        chatInput.style.height = "auto";
        chatInput.style.height = Math.min(chatInput.scrollHeight, AUTOSIZE_CAP_PX) + "px";
    }
    function applyMobileComposer() {
        if (!chatInput) return;
        if (MOBILE_MQ.matches) {
            chatInput.rows = 1;
            autosizeChatInput();
        } else {
            chatInput.rows = 3;
            chatInput.style.height = "";
        }
    }

    if (chatInput) {
        chatInput.addEventListener("input", () => {
            if (charCount) {
                const len = chatInput.value.length;
                charCount.textContent = len;
                charCount.parentElement.classList.toggle("over-limit", len > 3600);
            }
            clearEnterPending();
            if (MOBILE_MQ.matches) autosizeChatInput();
        });
        chatInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
                e.preventDefault();
                if (enterPending) {
                    clearEnterPending();
                    // requestSubmit is Safari 16+. On older iOS it is undefined,
                    // so Enter-to-send would throw and silently drop the message.
                    if (typeof chatForm.requestSubmit === "function") {
                        chatForm.requestSubmit();
                    } else {
                        chatForm.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
                    }
                } else {
                    showEnterHint();
                }
            } else if (e.key === "Escape") {
                clearEnterPending();
            }
        });
    }

    // --- Member-initiated coach handoff prompt (issue #103) ---
    // A persistent "Talk to a human coach" affordance under the chat window.
    // Shown once the member has sent at least one message. A 3-question flow:
    //   Q1: Would you like to discuss this with an Aikido Coach? (yes/no)
    //   Q2: Should I send them a summary of this chat? (yes/no) → shareSummary
    //   Q3: What specific question would you like to discuss? (free text)
    // On submit, POST /v1/handoffs with the message and render the returned
    // roomUrl via the existing coach-handoff-notice markup. Declining Q1
    // dismisses the prompt for the rest of the session (no nagging).
    let handoffDismissed = false;
    let shareSummary = false;

    function showHandoffPrompt() {
        if (handoffPrompt && !handoffDismissed) handoffPrompt.hidden = false;
    }

    function resetHandoffForm() {
        if (handoffForm) handoffForm.hidden = true;
        if (handoffQ2) handoffQ2.hidden = true;
        if (handoffQ3) handoffQ3.hidden = true;
        if (handoffQuestion) handoffQuestion.value = "";
        shareSummary = false;
        // Reset choice button highlight state
        if (handoffForm) {
            handoffForm.querySelectorAll(".coach-handoff-choice").forEach(b => {
                b.classList.remove("coach-handoff-choice--selected");
            });
        }
    }

    function renderHandoffNotice(roomUrl) {
        // Render the "We've been notified" + video-call-link notice directly
        // (reusing the existing coach-handoff-notice markup). We do NOT call
        // addMessage() with a handoff object here, because that would invoke
        // appendHandoffClarifyForm() and POST a second, duplicate handoff —
        // the member already supplied their question in Q3.
        const div = document.createElement("div");
        div.className = "coach-msg coach-msg-ai";
        const notice = document.createElement("div");
        notice.className = "coach-handoff-notice";
        const confirmed = document.createElement("p");
        confirmed.className = "coach-handoff-notified";
        confirmed.textContent = "We've been notified. A coach will reach out to you.";
        notice.appendChild(confirmed);
        const link = document.createElement("a");
        link.href = roomUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Join the video call with a human coach";
        notice.appendChild(link);
        const expiryNote = document.createElement("div");
        expiryNote.className = "coach-handoff-expiry";
        expiryNote.textContent = "This link expires when the coach joins or after 30 minutes. Do not share it.";
        notice.appendChild(expiryNote);
        div.appendChild(notice);
        messagesDiv.appendChild(div);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    if (handoffTrigger) {
        handoffTrigger.addEventListener("click", () => {
            if (handoffForm) {
                handoffForm.hidden = false;
                handoffTrigger.hidden = true;
            }
        });
    }

    if (handoffForm) {
        handoffForm.addEventListener("click", (e) => {
            const btn = e.target.closest(".coach-handoff-choice");
            if (!btn) return;
            const q = btn.closest(".coach-handoff-yesno");
            if (!q) return;
            const which = q.dataset.q;
            const val = btn.dataset.val;
            // Highlight the selected choice in this row
            q.querySelectorAll(".coach-handoff-choice").forEach(b => {
                b.classList.remove("coach-handoff-choice--selected");
            });
            btn.classList.add("coach-handoff-choice--selected");

            if (which === "q1") {
                if (val === "no") {
                    // Dismiss for the rest of the session without nagging
                    handoffDismissed = true;
                    handoffPrompt.hidden = true;
                    resetHandoffForm();
                    handoffTrigger.hidden = false;
                } else {
                    // Proceed to Q2
                    if (handoffQ2) handoffQ2.hidden = false;
                }
            } else if (which === "q2") {
                shareSummary = (val === "yes");
                if (handoffQ3) {
                    handoffQ3.hidden = false;
                    if (handoffQuestion) handoffQuestion.focus();
                }
            }
        });
    }

    if (handoffCancel) {
        handoffCancel.addEventListener("click", () => {
            resetHandoffForm();
            if (handoffTrigger) handoffTrigger.hidden = false;
        });
    }

    if (handoffSubmit) {
        handoffSubmit.addEventListener("click", async () => {
            const question = handoffQuestion ? handoffQuestion.value.trim() : "";
            handoffSubmit.disabled = true;
            if (handoffCancel) handoffCancel.disabled = true;
            try {
                const body = {
                    sessionId: "web_" + Date.now(),
                    message: question,
                    // shareSummary is honoured by the backend once issue #103's
                    // backend half ships; until then it is ignored (pydantic
                    // drops unknown fields). Sending it now is forward-compatible.
                    shareSummary: shareSummary,
                };
                const resp = await fetchWithTimeout(API + "/v1/handoffs", {
                    method: "POST",
                    headers: authHeaders(),
                    body: JSON.stringify(body),
                });
                if (resp.status === 401) {
                    window.location.href = (window.COACH_LOGIN_URL || (FORCE_STAGING ? '/staging/login.php' : '/login.php'))
                        + '?error=session_expired&redirect=' + encodeURIComponent(window.location.pathname);
                    return;
                }
                if (resp.status >= 400) {
                    addMessage("ai", httpErrorMessage(resp.status, "Could not request a coach right now. Please try again."));
                    handoffSubmit.disabled = false;
                    if (handoffCancel) handoffCancel.disabled = false;
                    return;
                }
                const data = await resp.json();
                const valid = validateChatResponse(data);
                const roomUrl = valid ? valid.roomUrl : (typeof data.roomUrl === "string" ? data.roomUrl : null);
                // Collapse the prompt UI; the notice renders in the message stream.
                resetHandoffForm();
                if (handoffTrigger) handoffTrigger.hidden = false;
                if (roomUrl) {
                    renderHandoffNotice(roomUrl);
                } else {
                    addMessage("ai", "We've been notified. A coach will reach out to you.");
                }
            } catch (err) {
                const msg = err && err.name === "AbortError"
                    ? "The request timed out. Please try again."
                    : "Network error: " + (err && err.message ? err.message : "unknown") + ". Please try again.";
                addMessage("ai", msg);
                handoffSubmit.disabled = false;
                if (handoffCancel) handoffCancel.disabled = false;
            }
        });
    }

    // --- Start ---
    applyMobileComposer();

    // Measure the actual sticky header height and expose it as --nav-h so the
    // CSS calc for .coach-shell min-height doesn't rely on a hardcoded 70px.
    // AikiField uses .af-header; QA uses header.site-nav / header. Feature-
    // detect and wrapped in try/catch so it can never take the chat down.
    try {
        const measureNav = () => {
            const nav = document.querySelector(".af-header, header.site-nav, header");
            if (nav) {
                document.documentElement.style.setProperty("--nav-h", nav.offsetHeight + "px");
            }
        };
        measureNav();
        window.addEventListener("resize", measureNav);
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
            const SCROLL_THRESHOLD = 80; // px from bottom to show the button
            const updateScrollBtn = () => {
                const atBottom = messagesDiv.scrollHeight - messagesDiv.scrollTop - messagesDiv.clientHeight < SCROLL_THRESHOLD;
                scrollBtn.hidden = atBottom;
            };
            messagesDiv.addEventListener("scroll", updateScrollBtn);
            updateScrollBtn();
            scrollBtn.addEventListener("click", () => {
                messagesDiv.scrollTop = messagesDiv.scrollHeight;
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
                // Keep the newest message visible above the keyboard.
                if (messagesDiv) messagesDiv.scrollTop = messagesDiv.scrollHeight;
            };
            window.visualViewport.addEventListener("resize", syncViewport);
            window.visualViewport.addEventListener("scroll", syncViewport);
        }
    } catch (err) {
        console.warn("coach-chat: could not attach visualViewport listener:", err);
    }

    // MediaQueryList.addEventListener is Safari 14+. Older iOS Safari only has
    // the legacy addListener, and calling the modern form there throws a
    // TypeError that aborts the rest of init — including enterChat(), leaving
    // the member with an empty chat pane. Feature-detect, and never let a
    // composer-ergonomics nicety take the chat down with it.
    try {
        if (typeof MOBILE_MQ.addEventListener === "function") {
            MOBILE_MQ.addEventListener("change", applyMobileComposer);
        } else if (typeof MOBILE_MQ.addListener === "function") {
            MOBILE_MQ.addListener(applyMobileComposer);
        } else {
            console.warn("coach-chat: MediaQueryList listeners unsupported; composer will not re-flow on rotate");
        }
    } catch (err) {
        console.warn("coach-chat: could not attach viewport listener:", err);
    }

    // Issue #184: populate the language selector from the backend
    initLanguageSelector();

    enterChat();
})();
