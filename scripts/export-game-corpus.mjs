#!/usr/bin/env node
// Export the Digital Experience game language into a Markdown corpus
// document for the AI Chat (AIRichardMoon backend/corpus/).
//
//   node scripts/export-game-corpus.mjs <output.md>
//
// The game's vocabulary (phase labels like "Take Musu", score labels like
// "Stirring") lives in games/lucky-wave/language.js — this script evals
// that file, merges the server-side vocabulary from games/ai-coach.json,
// and emits a sectioned Markdown document. Each phase becomes a `##`
// section so the corpus indexer's section field carries the phase name.
// The document also carries the URLs for accessing the game, so the chat
// can point users at it.
//
// Re-run after changing language.js or ai-coach.json, then rebuild the
// corpus index in AIRichardMoon (scripts/build_corpus_index.py).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://aikifield.com";

const outPath = process.argv[2];
if (!outPath) {
  console.error("usage: node scripts/export-game-corpus.mjs <output.md>");
  process.exit(1);
}

// language.js is a plain sequence of `const NAME = …` declarations — eval
// it in a Function scope and pull the constants back out.
const src = readFileSync(resolve(ROOT, "games/lucky-wave/language.js"), "utf8");
const { PHASES, PHASES_RMOONE, SCORES, SCORES_RMOONE } = new Function(
  `${src}\nreturn { PHASES, PHASES_RMOONE, SCORES, SCORES_RMOONE };`
)();
const coach = JSON.parse(readFileSync(resolve(ROOT, "games/ai-coach.json"), "utf8"));
const game = coach.games["lucky-wave"];

function scoreLine(scores) {
  return scores.map((s) => `${s.v} = "${s.label}"`).join(" · ");
}

function phaseSection(modeName, modeId, phase, index) {
  const lines = [
    `## ${modeName} — phase ${index + 1}: ${phase.label} (id: ${phase.id})`,
    "",
    `Components: ${phase.components.join(", ")}. Duration: about ${phase.seconds} seconds.`,
    "",
  ];
  for (const instruction of phase.instruction) {
    // 📢 marks emphasis spans in the game UI — strip it for prose.
    lines.push(instruction.replaceAll("📢", ""), "");
  }
  lines.push(`*${phase.cue}*`, "");
  return lines.join("\n");
}

const today = new Date().toISOString().slice(0, 10);
const md = `---
title: Ride the Lucky Wave — Digital Experience game
source: AikiField.com games/lucky-wave/language.js + games/ai-coach.json
generated: ${today}
---

# Ride the Lucky Wave — Digital Experience game

Ride the Lucky Wave is a short guided "Digital Experience" game on AikiField.com. It walks the player through four scored phases to build a peak state, then lets them send their lowest-scoring phases to the AI Chat for a recommendation ("${coach.ask.replace("{goal}", game.modes.rmoone ? "improve these" : "")}").

## Accessing the game

- Play version 2 (latest): ${SITE}/games/lucky-wave/RideTheLuckyWaveV2.php
- Play version 1 (legacy): ${SITE}/games/lucky-wave/RideTheLuckyWaveV1-legacy.php
- About the game: ${SITE}/games/lucky-wave/about.html
- All Digital Experience games: ${SITE}/games/

## Modes and scoring

The game has two modes. "Standard" mode uses generic state-practice language. "R. Moon mode" (mode id \`rmoone\`) uses language drawn from Richard Moon's Aikido teachings — centering, Unified-Field, Kokyu breath, Take Musu Aiki, the whisperings of the Kami. Each phase is scored 1–5.

R. Moon mode score labels: ${scoreLine(SCORES_RMOONE)}.

Standard mode score labels: ${scoreLine(SCORES)}.

A game report sent to the AI Chat names the mode, the phase label (not the phase id), and the score — e.g. "Take Musu — 2/5 (Stirring)" means the \`launch\` phase scored 2 out of 5, labelled "Stirring".

${PHASES_RMOONE.map((p, i) => phaseSection("R. Moon mode", "rmoone", p, i)).join("\n")}
${PHASES.map((p, i) => phaseSection("Standard mode", "standard", p, i)).join("\n")}
`;

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, md, "utf8");
console.log(`wrote ${outPath} (${md.length} bytes)`);
