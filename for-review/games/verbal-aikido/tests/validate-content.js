#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const testsDir = __dirname;
const contentPath = path.join(testsDir, '..', 'content.json');
const referencePath = path.join(testsDir, 'chapter2-reference.json');

if (!fs.existsSync(contentPath)) {
  console.log('content.json not found; run later');
  process.exit(0);
}

const errors = [];
const warnings = [];

function loadJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`ERROR: could not parse ${file}: ${error.message}`);
    process.exit(2);
  }
}

function findChapter2(content) {
  const candidates = [];
  if (content && typeof content === 'object') {
    candidates.push(content.chapter2, content.ch2);
    if (Array.isArray(content.chapters)) candidates.push(...content.chapters);
    if (content.story && Array.isArray(content.story.chapters)) candidates.push(...content.story.chapters);
    if (content.story && content.story.chapter2) candidates.push(content.story.chapter2);
  }
  return candidates.find((item) => item && (item.id === 'ch2' || /my first dojo/i.test(item.title || '')));
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[‘’“”]/g, "'")
    .replace(/…/g, '...')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function similarity(left, right) {
  const a = new Set(normalizeText(left).split(' ').filter(Boolean));
  const b = new Set(normalizeText(right).split(' ').filter(Boolean));
  if (!a.size && !b.size) return 1;
  let intersection = 0;
  for (const word of a) if (b.has(word)) intersection += 1;
  return intersection / Math.max(a.size, b.size);
}

function choicesOf(node) {
  return Array.isArray(node && node.choices) ? node.choices : [];
}

function sameChoice(actual, expected, destination) {
  const textClose = similarity(actual.text, expected.text) >= 0.72;
  const typeMatches = String(actual.type || '').toUpperCase() === String(expected.type || '').toUpperCase();
  return textClose && typeMatches && actual.nextNode === destination;
}

function enumeratePaths(chapter) {
  const paths = [];
  function visit(nodeId, meter, steps, visited) {
    const node = chapter.nodes[nodeId];
    if (!node) {
      paths.push({steps, outcome: 'missing', meter});
      return;
    }
    if (node.type === 'outcome' || !choicesOf(node).length) {
      paths.push({steps, outcome: node.outcome || 'unknown', meter});
      return;
    }
    if (visited.has(nodeId)) return;
    const nextVisited = new Set(visited).add(nodeId);
    choicesOf(node).forEach((choice, index) => {
      const destinations = [choice.nextNode];
      if (choice.pdfAlternativeNextNode) destinations.push(choice.pdfAlternativeNextNode);
      destinations.forEach((destination) => {
        const nextMeter = typeof choice.meterDelta === 'number' ? meter + choice.meterDelta : null;
        visit(destination, nextMeter, steps.concat({nodeId, index, choice, destination}), nextVisited);
      });
    });
  }
  const start = chapter.nodes[chapter.startNode];
  visit(chapter.startNode, start ? start.meter : null, [], new Set());
  return paths;
}

function canTraverse(actualChapter, referencePath, nodeMap) {
  let nodeId = nodeMap.get(reference.startNode);
  for (const step of referencePath.steps) {
    const node = actualChapter.nodes[nodeId];
    const destination = nodeMap.get(step.destination);
    if (!node || !destination) return false;
    const match = choicesOf(node).find((choice) => sameChoice(choice, step.choice, destination));
    if (!match) return false;
    nodeId = match.nextNode;
  }
  const terminal = actualChapter.nodes[nodeId];
  const terminalOutcome = terminal && (terminal.outcome || (['success', 'partial', 'retry'].includes(terminal.type) ? terminal.type : 'unknown'));
  return terminalOutcome === referencePath.outcome;
}

const reference = loadJson(referencePath);
const content = loadJson(contentPath);
const actual = findChapter2(content);

if (!actual) {
  console.error('FAIL: Chapter 2 (id "ch2" or title "My first Dojo") was not found in content.json.');
  process.exit(1);
}
if (!actual.nodes || typeof actual.nodes !== 'object') {
  console.error('FAIL: Chapter 2 has no nodes object.');
  process.exit(1);
}
// Node IDs are implementation details. Match normalized reference nodes to actual
// nodes by source text/outcome, then validate every edge using that correspondence.
const nodeMap = new Map();
const claimedActualIds = new Set();
for (const [referenceId, referenceNode] of Object.entries(reference.nodes)) {
  let bestId = null;
  let bestScore = -1;
  for (const [actualId, actualNode] of Object.entries(actual.nodes)) {
    if (claimedActualIds.has(actualId)) continue;
    let score = similarity(actualNode.text, referenceNode.text);
    const actualOutcome = actualNode.outcome || (['success', 'partial', 'retry'].includes(actualNode.type) ? actualNode.type : null);
    if (referenceNode.type === 'outcome' && actualOutcome === referenceNode.outcome) score = Math.max(score, 1);
    if (score > bestScore) {
      bestScore = score;
      bestId = actualId;
    }
  }
  if (bestId && bestScore >= 0.62) {
    nodeMap.set(referenceId, bestId);
    claimedActualIds.add(bestId);
  }
}
if (nodeMap.get(reference.startNode) !== actual.startNode) {
  errors.push(`startNode does not identify the PDF opening attack: found ${actual.startNode || '(missing)'}`);
}

const incoming = new Set();
for (const node of Object.values(actual.nodes)) {
  for (const choice of choicesOf(node)) if (choice.nextNode) incoming.add(choice.nextNode);
}

for (const [nodeId, expectedNode] of Object.entries(reference.nodes)) {
  const actualNodeId = nodeMap.get(nodeId);
  const actualNode = actual.nodes[actualNodeId];
  if (!actualNode) {
    errors.push(`missing node matching reference ${nodeId}: "${expectedNode.text || ''}"`);
    continue;
  }
  if (typeof expectedNode.meter === 'number' && actualNode.meter !== expectedNode.meter) {
    errors.push(`meter mismatch at ${nodeId}: expected ${expectedNode.meter}, found ${String(actualNode.meter)}`);
  }
  if (expectedNode.text && similarity(actualNode.text, expectedNode.text) < 0.72) {
    warnings.push(`text differs significantly at ${nodeId}: expected "${expectedNode.text}", found "${actualNode.text || ''}"`);
  }
  for (const expectedChoice of choicesOf(expectedNode)) {
    const destinations = [expectedChoice.nextNode];
    if (expectedChoice.pdfAlternativeNextNode) destinations.push(expectedChoice.pdfAlternativeNextNode);
    for (const destination of destinations) {
      const actualDestination = nodeMap.get(destination);
      const actualChoice = choicesOf(actualNode).find((choice) => actualDestination && sameChoice(choice, expectedChoice, actualDestination));
      if (!actualChoice) {
        errors.push(`missing choice at ${nodeId}: [${expectedChoice.type}] "${expectedChoice.text}" -> ${destination}`);
        continue;
      }
      if (expectedChoice.meterDelta !== null && actualChoice.meterDelta !== expectedChoice.meterDelta) {
        errors.push(`meterDelta mismatch at ${nodeId} [${expectedChoice.type}] -> ${destination}: expected ${expectedChoice.meterDelta}, found ${String(actualChoice.meterDelta)}`);
      }
      if (similarity(actualChoice.text, expectedChoice.text) < 0.9) {
        warnings.push(`choice text differs at ${nodeId} [${expectedChoice.type}]: "${actualChoice.text}"`);
      }
      const target = actual.nodes[actualDestination];
      const expectedTarget = reference.nodes[destination];
      if (typeof actualNode.meter === 'number' && typeof actualChoice.meterDelta === 'number' && target && expectedTarget && typeof expectedTarget.meter === 'number' && typeof target.meter === 'number') {
        const calculated = actualNode.meter + actualChoice.meterDelta;
        if (calculated !== target.meter) {
          errors.push(`meter transition mismatch: ${nodeId} (${actualNode.meter}) + ${actualChoice.meterDelta} -> ${destination} (${target.meter}); calculated ${calculated}`);
        }
      }
    }
  }
}

for (const nodeId of Object.keys(actual.nodes)) {
  if (nodeId !== actual.startNode && !incoming.has(nodeId)) errors.push(`orphaned node: ${nodeId}`);
}

const referencePaths = enumeratePaths(reference);
referencePaths.forEach((referencePath, index) => {
  if (!canTraverse(actual, referencePath, nodeMap)) {
    const route = referencePath.steps.map((step) => `${step.nodeId}:${step.choice.type}->${step.destination}`).join(' / ');
    errors.push(`untraversable reference path ${index + 1}: ${route} (${referencePath.outcome})`);
  }
});

console.log(`Chapter 2 validation: ${referencePaths.length} reference paths checked; ${errors.length} error(s), ${warnings.length} warning(s).`);
for (const warning of warnings) console.log(`WARNING: ${warning}`);
for (const error of errors) console.error(`ERROR: ${error}`);
if (errors.length) {
  console.error('FAIL: content.json does not match the Chapter 2 reference.');
  process.exit(1);
}
console.log('PASS: content.json covers the normalized Chapter 2 reference.');
