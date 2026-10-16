# Decisions

Append-only. Newest first.

## 2026-10-16 — Twenty Practices text is private data, served by the page (AF#114)

The free preview (`?src=li`) used to ship all 15 practices in the HTML and
hid 12 in the browser; three dead copies of the book text were also public.
Decision: ONE copy of the text in `data/exercises/practices.json`, in a
directory with its own `Require all denied`; the page reads it on the server
and sends anonymous visitors only the practices flagged `free` (1, 6, 12),
the rest as title-only stubs. Members get all 15. This is option C of the
ticket; deleting the preview was ruled out because the LinkedIn
taste-then-ask flow (issue #101) needs it. The five interlude poems are not
practices and stay in the page for everyone (owner may ask to gate them).

## 2026-10-11 — mini-wiki replaces monolithic CLAUDE.md project sections

Project knowledge moved to `.devin/wiki/`; CLAUDE.md/AGENTS.md
are now thin routers.
