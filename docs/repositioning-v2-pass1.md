# AikiField Repositioning — Pass 1: Strategy

Working document for Kenneth's review. Prepared from the repository
(`biofool/AikiField.com`, main @ `a6a010c`) rather than the live site.
The repo is ahead of production: the `/somatic-studios/` pathway from the
v1 work is committed but not deployed, and `approach.html` now carries the
shared navigation and a canonical tag — two items the brief's 9 October
fetch lists as defects are already fixed in source.

Nothing in this pass changes the site. Provisional recommendations are
marked **[provisional]** and can be reversed in review.

**Review outcome (Kenneth, 2026-10-09):** decisions 1, 2 and 5 approved as
recommended; decision 4 rights question resolved — Kenneth holds all
publication rights to the material; decision 8 resolved differently — see
below. Decisions 3, 6, 7, 9 remain provisional pending review.

---

## 1. Site audit and page disposition map

### Public marketing pages

| URL | What it is today | Disposition | Reason |
|---|---|---|---|
| `/index.html` | Coaching hero ("Ride the wave", "Learn to panic!"), vCISO bio, 3 ideas, 20 exercises, 2 games, v1 audience gateway | **Rewrite** | Hero voice undercuts premium position; homepage order must lead with bespoke coaching |
| `/coaching/` | Does not exist | **New** | Primary offer needs its own page; Pass 2 |
| `/community/` | Does not exist | **New** | Community-return programme home; replaces `/somatic-studios/` (see below); Pass 2 |
| `/somatic-studios/` | v1 lead-magnet landing page + intake form (committed, undeployed) | **Rewrite → merge into `/community/`** | v1 copy is funnel-flavoured ("lead magnet" logic, free-offer menu). v2 reframes as community return. Keep the URL pattern decision to Pass 2; recommended: 301 `/somatic-studios/` → `/community/` |
| `/somatic-studios/thanks.html` | v1 thank-you page | **Rewrite** | Becomes community application confirmation |
| `/services.html` | Fractional CISO flagship + programme buildout + DevSecOps + security coaching | **Keep, refocus** | Under the bounded-track decision (1) this becomes the security track page. Coaching copy on it is security-specific and stays there |
| `/process.html` | Four agreements + six phases, written for security engagements | **Keep, light rewrite** | The agreements/phases generalise; rewrite framing so it describes how Kenneth works, with security as an application |
| `/approach.html` | Method page — Inspired Presence, Relational Harmony, Open Inquiry | **Keep, rewrite framing** | Vocabulary is the coaching method's core asset. Strip security-only framing; same ideas serve the wider audience |
| `/case-studies.html` | One anonymised 9-year fractional CISO engagement | **Keep** | Real evidence for the security track. Reconcile the 87% figure before reuse |
| `/contact.html` | Single form, five security options + Other, no consent | **Rewrite** | Becomes the coaching enquiry route (or a router to per-audience forms). Consent split required |
| `/assessment.html` | Security Maturity + Leadership Presence assessments | **Keep** | Both are supporting assets; presence assessment is coaching-relevant. Resite under the correct audience context in Pass 2 nav |
| `/fractional-ciso.html` | Fractional CISO SEO landing page | **Keep** | Security track |
| `/fractional-ciso-for-saas.html` | Hire-vs-full-time SEO article | **Keep** | Security track; footer-linked |
| `/ai-devsecops-vulnerability-remediation.html` | 21→3 days SEO article | **Keep, fix claim** | Security track; must agree with the reconciled case-study figures |
| `/board-security-clarity.html` | Board reporting SEO page | **Keep** | Security track; unlisted in nav — check it is footer/SEO-only deliberately |
| `/projects.php` | Demonstration Technologies: 7 projects + phronesis essay | **Rewrite** | WSF description contradicts the outreach principles; essay violates the quantum-framing rule; Pass 2 |
| `/books.html` | Richard Moon bibliography, free PDFs | **Keep** | Correctly presents Richard's own work; check credit lines during Pass 2 |
| `/blog/` (19 posts) | "Author's Insights" — Richard Moon's essays, branded Quantum Aikido | **Keep, clarify attribution** | This is Richard's content hosted on aikifield.com. Keep, but every page must make authorship unambiguous so the site does not appear to speak for him |
| `/digital-experience/` hub + lucky-wave, moon-practices, unified-field-chat, verbal-aikido | Gated-practice preview pages | **Keep, rename one** | "Moon — 20 Exclusive Practices" label must change (decision 4) |
| `/games/` (exercises app, lucky-wave, privacy, terms) | The actual exercise/game apps | **Keep** | Access model depends on decision 8 |
| `/members.php`, `/login.php`, `/dashboard.php` | Unified Field Chat, blind login, ops dashboard | **Keep** | Infrastructure; remain blind |
| `/beta/` | Gated assessment pages | **Keep** | Internal tooling |
| `/for-review/` | Gated review builds (verbal-aikido, docs) | **Keep** | Internal tooling |
| `/ask/`, `/AEO/` | Answer-engine knowledge layer | **Keep** | Aligned with AI-search visibility positioning |
| `/input/` | Scraped legacy WordPress content | **Retire (no action needed)** | Already excluded from `sync.sh`; not deployed |
| `contact-handler.php`, `studio-review-handler.php` | Form handlers | **Rework** | Per-audience handlers + split consent (Pass 3) |

### Redirect map (301)

| From | To | Why |
|---|---|---|
| `/somatic-studios/` | `/community/` | Audience route renamed to programme framing |
| `/somatic-studios/thanks.html` | `/community/thanks.html` | Follows parent |
| `/digital-experience/moon-practices.html` | `/digital-experience/practices.html` | Removes Richard's name as product label (decision 4) |

No other URL moves. All legacy `.html` URLs stay — changing them costs
search equity for no benefit.

### Items the brief missed (repo-only findings)

- `blog/` is Richard Moon's own essay series ("Author's Insights | Quantum
  Aikido") hosted under aikifield.com. It is an asset, but today nothing
  on those pages says the words are Richard's, not AikiField's.
- `games/exercises/data/collected_exercises_app_data.json` names
  `"author": "Richard Moon"` and cites sources including *Adventures in
  Aiki-land* (2010) and class teaching. Republication rights need explicit
  confirmation (decision 4) — this is a real rights question, not a
  formality.
- `board-security-clarity.html` exists but is unreachable from nav and
  footer — confirm it is intentional SEO-only surface.
- `input/` contains a scraped legacy coaching site (old WordPress
  property) — already undeployed; useful as source material for Kenneth's
  earlier coaching positioning language.

---

## 2. Strategic critique

### What is strong

- **Real credentials.** 20+ years in security, a nine-year fractional CISO
  engagement with numbers, 40+ years of Quantum Aikido, 6th dan, a named
  lineage. Most coaching sites have none of this.
- **A working method vocabulary.** "Energy follows attention"; the three
  openings and nine practices are already articulated, internally
  consistent, and genuinely Kenneth's. Few coaches have a named, legible
  method.
- **Working software.** The exercises app, games, chat, WSF and the other
  demonstrations are unusual proof of competence for a coaching practice.
- **A real second audience.** The blog, books, exercises and WSF give the
  somatic/movement community work substance most "community programmes"
  lack.

### What is risky or must change — the named conflicts

1. **The commercial centre is security.** Title tags, meta descriptions,
   footer, the case study, the assessment and the contact form all sell
   fractional CISO work. Coaching sits inside a security wrapper. If
   coaching is the primary offer, the page hierarchy must invert — this
   is decision 1 and it gates all homepage copy.
2. **World Studio Finder contradicts the community programme.** The
   public description on `projects.php` is a scrape–enrich–mail-merge
   pipeline with automatic contact-form submission. The community
   programme promises permission-based contact and no harvesting. A
   studio owner who reads both pages will not trust either. Fix by
   changing what the tool does (decision 3) and rewriting the page —
   copy alone cannot repair this.
3. **Richard's name is a product label.** "Moon — 20 Exclusive Practices"
   plus "unavailable anywhere else" reads as if Richard's material is an
   AikiField product. The exercises data confirms the material is
   Richard's (books + class teaching). Rename, credit, confirm rights.
4. **The hero voice undercuts a premium position.** "Learn to panic!",
   stacked exclamation marks, "Cyber Aikido Guy", the courage cliché —
   motivational-speaker register. Premium coaching copy is quieter.
5. **No coaching evidence exists on the site.** Every proof point is a
   security outcome. Until coaching evidence exists (decision 7), the
   coaching page must rest on credentials, method and writing.
6. **One figure, two meanings.** `case-studies.html`: 87% = remediation
   time cut (165→21 days). `contact.html`: 87% = "customer-reported
   security risk eliminated in three thirty-minute meetings."
   `services.html` + the DevSecOps page cite 21→3 days. Three different
   claims sharing overlapping numbers. Reconciliation needed before any
   reuse — the contact-page claim is the weakest and least traceable.
7. **One form, no consent.** All audiences funnel into a
   security-oriented form with no consent capture. The v1 studio form
   has two checkboxes but merges listing consent with follow-up
   permission loosely; v2 requires service consent and marketing consent
   as separate, un-pre-ticked boxes on every form.
8. **The quantum framing runs the wrong way.** The `projects.php` essay
   presents quantum concepts (uncertainty, entanglement, observer effect)
   as the basis of the leadership work. The standing rule is the
   opposite: practice came first; quantum language described it. The
   essay must be rewritten so physics is the vocabulary, never the
   source.
9. **Mechanics are inconsistent.** "Centre" (index) vs "Center"
   (approach); mixed "I"/"we" voice; favicon as `og:image`. The nav and
   canonical defects the brief lists are already fixed in the repo.

---

## 3. Decision memo — nine decisions

### 1. Where the security practice lives

**Options:** (a) bounded track inside AikiField for founders/technical
leaders who own security; (b) separate brand/subdomain (Enlightened
Cybersecurity); (c) security primary, coaching as differentiator.

**Recommendation: (a) bounded track inside AikiField. — APPROVED**

- (b) is the cleaner long-term architecture but doubles site maintenance,
  splits domain authority, strands the case-study proof, and delays the
  repositioning by months. Enlightened Cybersecurity remains an option
  later — nothing in (a) forecloses it.
- (c) contradicts the brief; included only to price the alternative: it
  keeps the current funnel but loses the coaching positioning entirely.
- Cost of (a): the homepage carries two stories; mitigated by the
  audience-gateway pattern already built in v1 and by keeping all
  security pages in one nav group.

**Downstream:** `services.html` becomes the security-track home under a
nav group label such as "For Technical Leaders" or stays "Services" with
the coaching pages above it. Security SEO pages unchanged. Footer tagline
rewritten.

### 2. Community programme vs Dojo Growth Services

**Recommendation: the community-return programme absorbs
Dojo Growth Services; aikido dojos are in scope. — APPROVED**

- The Dojo Growth bundle (AEO, Dojo Cho coaching, SEO, facilitator guide,
  the game) was designed as a mass-customised paid offer. A
  mass-customised offer to a small community reads as a sales funnel —
  exactly what v2 forbids. The components survive, but as things a studio
  *may* receive through the programme or later buy, not as a SKU.
- Aikido dojos belong in scope: they are the community Kenneth and
  Richard actually come from, and WSF already maps them. "Somatic and
  movement studios, including aikido and martial-arts schools."
- Trade-off: less packaged revenue framing; the warm pilot (15–20 studios
  that already know Kenneth or Richard) is unchanged.

### 3. What World Studio Finder does now

**Recommendation [provisional]: both — a consent-based public directory
built on an internal research tool.**

- Keep: discovery/mapping pipeline (Places/scrape for *finding* studios),
  the dataset, the directory concept.
- Stop: Hunter.io/NeverBounce email harvesting for outreach, cold
  mail-merge campaigns, automatic contact-form submission. Discovery data
  is used for research and for identifying candidate studios for the
  *warm* pilot — contacted only where a lawful basis exists and only by
  personal note.
- Trade-off: the pipeline's automation value drops sharply; its value
  becomes the map itself. Honest cost: the most impressive engineering in
  the current description is the part that must stop.
- `projects.php` WSF section rewritten to describe the directory and the
  research map; the pipeline diagram and figure get replaced.

### 4. How Richard and his material appear

**Recommendation:**

- Rename "Moon — 20 Exclusive Practices" → "Twenty Practices" (nav label
  and page title), with a credit line "from the work of Richard Moon" and
  a link to quantumaikido.com. URL → `/digital-experience/practices.html`
  with a 301.
- **Rights: RESOLVED.** Kenneth holds all publication rights to the
  material (confirmed 2026-10-09). Credit and attribution lines still
  apply — rights ownership is not a licence to imply AikiField authored
  the work.
- Public description: "Kenneth Kron, Richard's long-time student." Richard
  introduced as "one of the world's foremost teachers of Aikido's inner
  art" with Cyprus peace work as proof point. No Nadeau mentions.

### 5. Spelling

**Recommendation: New Zealand/British spelling site-wide. — APPROVED**

- The practice is Kenneth's voice; he works from NZ. "Centre" is also the
  method's own term in QA usage. Consistency matters more than dialect
  matching — US buyers read "centre" as British polish, not error.
- Trade-off: US-centric security SEO pages in British spelling; minor and
  acceptable. Alternative (US spelling) was considered and rejected —
  it would read as marketing flattening on the coaching pages.
- Downstream: `en.json` sweep, "Center/Ground/Flow" →
  "Centre/Ground/Flow" where it is prose (check against the source
  method's own capitalisation before changing the nine practice names —
  if QA canon uses "Center", keep "Center" as a proper noun and note the
  convention).

### 6. Boundary with Neuro Wellness Dojo

**Recommendation [provisional]: clean separation by audience and claim —
no nav link; a single factual mention at most.**

- NWD = somatic relaxation skills for individuals facing dental anxiety
  (health-adjacent, consumer). AikiField = coaching for leaders +
  digital/business support for studios. Neither sells the other's
  service.
- Line: AikiField never offers personal somatic coaching for health
  conditions; NWD never offers business services. The community page's
  scope boundary ("digital, business and technology support, not
  clinical, therapeutic or medical advice") does double duty here.
- No cross-links in nav. If Kenneth wants the relationship visible, one
  line in a bio/about block: "He also runs Neuro Wellness Dojo, a
  separate practice teaching relaxation skills for dental anxiety."

### 7. Coaching evidence

**Inventory (cleared/likely-clearable):** credentials (20+ yrs security,
former CISO, 40+ yrs QA, 6th dan, Richard's long-time student, NZ–CA);
the method itself as artefact (exercises, games, assessments);
Kenneth's writing (the phronesis essay once fixed, earlier coaching-site
copy in `input/`); possibly talks/podcasts — **unconfirmed, ask Kenneth.**
No client testimonials confirmed.

**Recommendation [provisional]:** the coaching page leads with method +
credentials + writing; Pass 3 includes a testimonial-gathering plan
(pilot studios and early coaching clients as first sources). Nothing
invented.

### 8. Free exercises behind an account?

**Decision — RESOLVED (differs from the recommendation):** complete
access to the exercises requires an account. The gate stays.

- Per Kenneth: full access to the twenty exercises sits behind the free
  AikiField account. An unauthenticated visitor may still sample: the
  balance/grounding exercise(s) and the breathing exercise built around
  "breathe exactly like you want to" are to be available free, without
  sign-in — a taster, not open access.
- Implementation: `games/exercises/auth-state.php` currently unlocks all
  practices for logged-in sessions only; extend it so a named free subset
  (the balance and breathing exercises) is unlocked for everyone, with
  the remaining exercises gated.
- **Open detail for Kenneth:** no exercise is literally titled "Balance
  and Breathe". Candidate free set: a grounding/balance exercise (e.g.
  "Wrist Grab Grounding" or "Feel / Locate / Align / Unify") plus "The O2
  Continuum" (the "breathe exactly the way you want" exercise) or "listen
  to the impulse to breathe". Confirm the exact free exercise IDs before
  the auth-state change ships.

### 9. Signal price or engagement shape?

**Recommendation [provisional]: signal engagement shape, not price.**

- "Engagements begin with a short series of conversations" / "a minimum
  initial commitment of three sessions" — pre-qualifies without fee
  anchoring, and without a public price that needs maintenance.
- Appears on `/coaching/` (how engagements begin) and in the enquiry-form
  confirmation copy. The community page carries no pricing at all.

---

## 4. Refined positioning

**One sentence:**
AikiField is a bespoke coaching and advisory practice that helps leaders,
founders and practitioners apply serious ideas to the situation they are
actually facing.

**50-word version:**
AikiField is a coaching and advisory practice for people facing
meaningful personal, professional or organisational challenges. Kenneth
Kron brings forty years of Aikido practice and twenty years of security
leadership to a bespoke inquiry process — understanding your situation,
applying the relevant principles, and converting insight into practical
movement.

**Coaching value proposition:** You don't get a programme; you get a
thinking partner with a method. The work begins from your actual
situation, draws on a tested vocabulary of attention, presence and
conflict, and ends in practical steps you can take this week.

**Community-return value proposition:** AikiField reserves part of its
capacity for the somatic and movement communities that inform its wider
work — selected studios receive a practical review of their public
digital presence and student-discovery pathway, with no obligation to
become a client.

**Brand promise:** Ideas applied to your situation, tested in
conversation, converted into action.

**Differentiators:** a named, articulated method (not generic coaching);
real evidence of high-stakes work (security track record); working
tools that demonstrate the ideas; community contribution as practice,
not marketing.

**What AikiField does not do:** packaged programmes, generic life
coaching, clinical or therapeutic advice, marketing-agency services,
guaranteed outcomes, bulk outreach or growth-hacking, speaking for
Richard Moon or Quantum Aikido.

---

## 5. Brand architecture

**Primary offer:** bespoke coaching and advisory (Kenneth, first person).

**Security track [provisional, per decision 1]:** one bounded section of
the site — its own nav group, its own pages, its own CTA ("Book a
discovery call"), positioned below the coaching story. All fractional
CISO / DevSecOps / board-reporting pages live here unchanged in URL.

**Community-return programme:** pro bono studio consulting, visibly
present but at a lower visual level than the paid offer; no upsell, no
pricing, no paid case studies on community pages.

**Supporting assets:** Twenty Practices (renamed), Ride the Lucky Wave,
Slow Your Roll, Unified Field Chat, the two assessments, WSF directory,
blog/books (clearly attributed to Richard), ask/AEO layer,
MultiCloud-MultiPass and the other demonstrations (security track).

**Provisional homepage order:**
1. Coaching hero (one of three directions — Pass 2)
2. Who the coaching is for
3. What the bespoke process involves
4. Why contextual inquiry differs from generic advice
5. Evidence: credentials, method, writing
6. Security track (bounded, own CTA)
7. Community-return programme
8. Supporting projects and practices
9. Invitation to begin a conversation

**Provisional navigation labels:**
Home · Coaching · Approach · Security (submenu: Services, Process, Case
Studies, Fractional CISO, Assessments) · Community · Practices &
Projects (submenu: Twenty Practices, Games, Demonstration Technologies,
Books, Blog) · Contact → per-audience enquiry routes.

The v1 nav link "For Somatic Studios" is replaced by "Community".

---

## Open items for Kenneth before Pass 2

1. ~~Confirm decision 4's rights question~~ — RESOLVED: Kenneth holds all
   publication rights.
2. Which exercise IDs form the free taster set under decision 8.
3. Coaching evidence: do testimonials, talks or podcast appearances exist
   that may be named? (decision 7 still provisional)
4. Confirm "Richard's long-time student" and the standing Richard
   description still hold.
5. How much location detail goes public (NZ–California)?
6. ~~NZ/British spelling~~ — APPROVED.
7. Programme name preference ahead of Pass 2 (candidates: AikiField
   Community Return, Studio Fieldwork, The Somatic Studio Support
   Programme — recommendation and mark search in Pass 2).
8. Decisions 3, 6 and 9 are still marked provisional — confirm or amend.
