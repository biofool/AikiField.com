# Verbal Aikido Story Mode — Testing notes

## Automated validation

A reference validator lives in `tests/validate-content.js`. It compares `content.json` against `tests/chapter2-reference.json` and checks all 43 Chapter 2 paths, meter transitions, and text matches.

```bash
node for-review/games/verbal-aikido/tests/validate-content.js
```

Result expected: `PASS: content.json covers the normalized Chapter 2 reference.`

## Sample click-through paths

### Chapter 1 — successful path

1. From the chapter select screen, choose **Chapter 1: A different way to respond**.
2. Read the intro, click **Start chapter**.
3. Meter shows `1` (tense face).
4. Attacker says: *"You always think you're right about everything!"*
5. Choose the **A** (Aikido) reply: *"I do often think I'm right, yes. Tell me more about what's going on with you though."*
6. Meter drops to `0`.
7. Attacker responds: *"Emmm…"*
8. Success screen appears: energy shift achieved.

### Chapter 1 — retry loop

1. Choose **Chapter 1**.
2. Pick any non-Aikido reply (J, C, or F).
3. Feedback overlay reveals the response type and meter effect.
4. Click **Continue**.
5. A slightly varied attack appears (e.g. *"Why do you always act like you know best?"*).
6. Try another wrong reply → feedback → another varied attack.
7. Finally pick the **A** reply → success.

### Chapter 2 — full success (Y1) via X2

1. Choose **Chapter 2: My first Dojo**.
2. Click **Start chapter**.
3. Meter shows `2`.
4. Attacker: *"You're so selfish!"*
5. Choose **A**: *"What do you mean?"* → meter `-1` → `1`, go to X1.
6. Attacker: *"I mean… you only seem to think about what you want to do!"*
7. Choose the first **J**: *"Hold on, it's not all I ever think about..."* → meter `+1` → `2`, go to the *"So now I'm lying..."* branch.
8. Choose **A**: *"OK look, how about we get back to what you want to talk about..."* → meter `-1` → `1`, go to X2.
9. Attacker: *"Well it's been like this for quite some time now..."*
10. Choose **A**: *"OK, well what would you prefer to happen?"* → meter `-1` → `0`, go to Y1.
11. Full success: energy shift.

### Chapter 2 — full success (Y1) via longTimeAttack

1. Choose **Chapter 2**.
2. At the opening, choose **A**: *"What do you mean?"* → X1.
3. At X1, choose the **second J** option: *"Hold on, it's not all I ever think about..."* → *"Well, it definitely seems like a long time..."* branch.
4. Choose **A**: *"I think I can see why it might seem like that. So, what would you like to see happening instead?"* → Y1.

### Chapter 2 — partial success (Y2)

1. Choose **Chapter 2**.
2. At opening, choose **A**: *"What do you mean?"* → X1.
3. At X1, choose **A**: *"And, what would you prefer?"* → meter `-1` → `0`, Y2.
4. Partial success screen: *"Hmm. OK… let's pick this up later."*

### Chapter 2 — retry because of high anger

1. Choose **Chapter 2**.
2. Attacker: *"You're so selfish!"*
3. Choose **C**: *"No I'm not, you're the selfish one!"* → meter `+1` → `3`.
4. Attacker: *"Shut up! I don't see the point in talking to you!"*
5. Choose **C** or **J** → retry/lesson screen.
6. Click **Try again** to restart the chapter.

### Chapter 2 — retry via X2 N path

1. Choose **Chapter 2**.
2. At opening, choose **A** → X1.
3. At X1, choose **N**: *"Well it seems to me like you're over-reacting..."* → meter `+2` → `3`.
4. Attacker: *"Are you serious? Not only are you selfish..."*
5. Choose **A**: *"Look… I'm serious about us sorting this out..."* → X2.
6. At X2, choose **N**: *"Well there's no point getting angry about it, just chill out!"* → meter `+1` → `2`, retry.

### Discovery mode — unlock, lesson, quiz

1. From the chapter select screen, click **Discovery mode — lessons, videos & articles**.
2. Both lesson cards appear locked: "Locked — Complete Chapter 1: …" / "Locked — Complete Chapter 2: …". Locked cards are disabled (not clickable).
3. Click **Back to chapters**.
4. Complete Chapter 1 (choose the **A** reply at the attack).
5. On the success screen click **Check out Discovery mode** → the Discovery list opens with lesson 1 now "Unlocked — start lesson"; lesson 2 still locked.
6. Click the lesson 1 card → lesson view shows title, intro paragraphs, a "Media:" placeholder note, and a **Take quiz** button.
7. Take the quiz: each answer shows immediate correct/incorrect feedback with an explanation, then **Next question** / **See score**.
8. Score ≥ 2/3 → "Passed ✓" banner; the lesson is marked complete. Back on the list the card shows "Completed — review anytime" and a ✓.
9. Reload the page — the Discovery list view is restored and unlock/completion state persists (localStorage `va-game-progress`).
10. Complete Chapter 2 (full-success path) → **Check out Discovery mode** → lesson 2 is now unlocked.
11. Failing a quiz (< 2/3 correct) shows "Not passed — try again" and offers **Retake quiz**; the lesson is not marked complete.

### Practice mode

1. Click the **Practice** tab → three activity cards (Centering, Stretching, Sparring).
2. **Centering**: 5 recordings render with style filter, star ratings, and ♡/♥ favorite buttons. Rate one 4 stars and favorite another → reload → both persist.
3. **Stretching**: pick **Posture 1** → answer the guided questions with free text → "Stretching session complete" screen; `stretchSessions` increments.
4. **Sparring** (before passing the Discovery quiz): shows "Validate basic knowledge first" gate with a **Go to Discovery** button; no mat button.
5. **Sparring** (after passing the `disc_reactive_responses` quiz): **Step on the verbal mat** → bot attack at meter 2 → pick a response type. **A** drops the meter and increments `sparringSessions`; non-A raises the meter and shows the tip.

### Community mode & minor gate

1. Click the **Community** tab → three cards: Forums, Events, Find a Practitioner.
2. **Forums**: pinned "What happens when you fall" thread renders first with a 📌 badge; other threads list excerpts and reply counts. A note says posting requires member accounts.
3. **Events**: four events render with format tags and meta lines (location · price · belt · theme). The format filter narrows to Online or In person.
4. **Find a Practitioner (no age given)**: shows the age check — no practitioner list.
5. Enter a DOB under 18 (e.g. today's date minus 10 years) → **Confirm age** → minor message appears with **Go to Practice activities** / **Browse events** buttons; no practitioner cards. `localStorage['va-age-gate']` has `locked: true` and an `age_declared` entry with `isMinor: true` (no birthdate in the log).
6. Open **Profile** → the date form is gone; a notice says the date can't be changed here.
7. **Story → Reset all progress** → confirm → back to **Find a Practitioner**: still the minor message, still no date form.
8. In a fresh profile (clear site data), enter an adult DOB → practitioner cards appear with avatar, belt tag, languages, modes and availability, plus a note that they are sample profiles; the language filter narrows the list. The Profile date form stays editable for adults.
9. Reload — the age record persists.

### Extras

1. Click the **Extras** tab → three sections: Multimedia library, Practical tips & activities, VA Store.
2. Toggle a reminder on a tips row → "Reminders on" pill → reload → still on.
3. Store items render sorted by price, marked as placeholders.

### Profile / belts

1. Click the **Profile** tab → belt chip, stats grid, avatar picker, language selector.
2. Fresh state = **White belt**. Complete Chapter 1 + pass the quiz → **Yellow belt** with "Next belt (Orange)" progress line.
3. Pick an avatar → reload → avatar persists and shows next to the belt name.

### Automated e2e

The Playwright spec `tests/e2e/specs/va-game.spec.js` covers all of the above:

```bash
bash tests/e2e/run.sh va-game
```

## Keyboard / accessibility checks

- Tab through choice buttons; focus outline should be visible.
- Press `Enter` or `Space` to activate a choice.
- After making a non-Aikido choice, a live region announces the response type and meter change.
- The meter uses `role="meter"` with `aria-valuenow`, `aria-valuemin`, and `aria-valuemax`.

## PWA / offline checks

### Service worker & manifest

1. Serve the folder: `cd /home/kkron/projects/github/AikiField.com/for-review/games/verbal-aikido && php -S 0.0.0.0:8081`
2. Open `http://localhost:8081/` in Chrome/Edge.
3. Open DevTools → **Application → Service Workers**: confirm a worker is registered for scope `http://localhost:8081/` and status is "activated".
4. **Application → Manifest**: verify the name, short name, start URL, theme color, background color, and icons appear.
5. **Network tab**: set throttling to **Offline** (or disable the network) and reload. The game should still start and reach the chapter-select screen.

### Offline gameplay

1. With the page loaded and the service worker activated, disable the network.
2. Reload the page.
3. Expected: the game loads, shows the connection indicator as **Offline**, and allows selecting a chapter and playing through choices.
4. If the cache is cleared and the network is disabled, the offline error screen should appear with a **Retry** button.

### Install prompt / mode toggle

1. Load the page in Chrome/Edge (desktop or Android) with a manifest that meets install criteria.
2. Confirm the connection-status indicator shows **Online**.
3. Click the **Browser / App** toggle to switch it to **App** mode.
4. If the browser fired `beforeinstallprompt`, an **Install app** button should appear in the header and a panel should offer **Install Verbal Aikido**.
5. Click the install button and confirm (or cancel) the browser prompt.
6. Switch the toggle back to **Browser**: the install UI should hide/return to normal.
7. On iOS Safari, switching to **App** mode should show manual instructions instead of an install button.
8. Reload the page — the toggle should remember the last mode via `localStorage` (`va-pwa-mode`).

### Lighthouse / automated PWA checks

1. Open Chrome DevTools → **Lighthouse**.
2. Run the **PWA** audit on the page.
3. Expected (best-effort on localhost):
   - Registers a service worker.
   - Has a valid web app manifest.
   - start URL responds with a 200 when offline.
   - Some icon/maskable warnings may remain if testing on a non-HTTPS localhost.

## Known edge cases to verify

- Meter never exceeds `3` or drops below `0`.
- Choosing a non-Aikido reply in any attack node shows the feedback overlay before continuing.
- Chapter 1 wrong choices cycle through three slightly varied attacker lines.
- The chapter-select screen unlocks Chapter 2 by default in the prototype, and marks Chapter 1 complete after its success node.
- Clearing progress from the chapter-select screen resets the state and returns the player to chapter selection.
