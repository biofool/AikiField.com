# LinkedIn → Digital Experience: Design Thinking Phase Prompts

**Goal:** Follow up on the 6,421-impression LinkedIn group post by giving LinkedIn visitors instant access to the AikiField Digital Experience, with Sign In with LinkedIn (OpenID Connect) replacing the account form.

**How to use:** Run each prompt in order. Paste the previous phase's output where marked. Each prompt ends at a decision point so you stay in control. No code is written before Phase 4.

## Phase 1: Empathize

**Prompt:**

You are helping me understand the people arriving at aikifield.com from Richard Moon's LinkedIn posts.

Context: In the week of 14–20 Sept 2026, Moon's LinkedIn posts got 6,758 impressions, 12.7x the prior week. One group post offering free PDFs of Life in Three Easy Lessons drew 6,421 of them. Other copies of the same offer got 5–78 impressions. LinkedIn reported top viewers as senior staff at 10,001+ employee companies in IT services and consulting.

Tasks:

- Describe 2–3 plausible visitor personas from that audience: what they were doing when they saw the post, what made them click, and what they expect in the first 60 seconds.
- Walk the current journey from LinkedIn post to aikifield.com/digital-experience/, step by step. Fetch the live pages and report what you actually see, including where an account is required.
- List every point of friction or doubt, ranked by likely drop-off.
- List what we don't know yet and how to find out (e.g. the group name, link clicks, current sign-up rate).

Do not propose solutions yet. Keep it brief and in bullets.

## Phase 2: Define

**Prompt:**

Here are the Phase 1 findings: [paste].

Tasks:

- Write one "How might we…" problem statement that balances instant access with capturing a contact for follow-up.
- Define success measures for a 30-day test: impressions on the new group post, tagged clicks, first-exercise completions, LinkedIn sign-ins, and emails captured. Suggest realistic thresholds that would tell us it's a repeatable channel versus a one-off.
- State constraints: free experience only, no paid content unlocked, privacy disclosure for LinkedIn data, group posting rules, and the existing AikiField account system.
- Identify the current auth setup on aikifield.com (custom PHP or a provider such as Supabase, Firebase or Auth0). Inspect the site and report what you find; do not guess.
- End with the open decisions I need to make.

## Phase 3: Ideate

**Prompt:**

Here is the Phase 2 problem statement and constraints: [paste].

Tasks:

- Generate access-model options, including: open door via a `?src=li` link; taste-then-ask (Exercise 01 and Ride the Lucky Wave open instantly, then a save-progress prompt); a time-limited pass; and Sign In with LinkedIn as the one-click gate.
- Generate 5 follow-up LinkedIn post concepts for the same group, each built around one practice from Moon's 20 (e.g. DropBackSinkOpen), written for a senior leader under pressure, with a "try it now" call to action. Post from Moon's account, in his voice, with an image idea for each.
- Decide whether the Unified Field Chat should be included in instant access, weighing cost and abuse risk.
- Score each access option on friction, contact capture, build effort and risk.
- Recommend one access option and two post concepts, with a one-line reason each. Run an AI-tell scrub on any post copy: no em dashes, no "not just X but Y," no tricolons, no hedging filler.

## Phase 4: Prototype

**Prompt:**

I've chosen [access option] and [post concept]. Build a minimal prototype.

Auth tasks:

- Integrate Sign In with LinkedIn using OpenID Connect with scopes `openid profile email`, the `https://www.linkedin.com/oauth/v2/authorization` and `/oauth/v2/accessToken` endpoints, and `https://api.linkedin.com/v2/userinfo`. Do not use the deprecated `r_liteprofile` or `r_emailaddress` scopes.
- Match existing AikiField accounts by verified email; store LinkedIn `sub` as the stable key. Keep the client secret server-side and validate `state`.
- When `?src=li` is present, show "Continue with LinkedIn" first; otherwise show the normal sign-up.
- Log events for: tagged landing, LinkedIn sign-in started, completed, failed, Exercise 01 completed.
- Add the LinkedIn data disclosure to the privacy page.

Before writing code, show me the plan and the files you'll touch, and wait for my go-ahead. After building, verify empirically: run the flow end to end against the running site, confirm versions, and report what you actually observed.

Post tasks: produce the final post copy, image brief and tagged link, ready for Moon to post.

## Phase 5: Test

**Prompt:**

The prototype is live and the post went up on [date] in [group name]. Here is the data: [paste LinkedIn analytics and site event counts].

Tasks:

- Compare against the Phase 2 thresholds and against the original 6,421-impression post.
- Show the funnel: impressions → clicks → LinkedIn sign-ins → Exercise 01 completions → emails captured, with the biggest drop-off highlighted.
- Say plainly whether this looks like a repeatable channel or another outlier, and what evidence would change that view.
- Recommend one change for the next iteration and which phase to loop back to.
- Write a short, plain-language summary I can paste to Moon and Robb.
