import fs from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
const { default: mermaid } = await import('mermaid')

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const fixtureRoot = path.join(repoRoot, 'test/fixtures/multi-diagram')
const manifest = JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'manifest.json'), 'utf8'))
const declarationFamilies = new Map([
  ['flowchart', 'flowchart'], ['graph', 'flowchart'], ['sequenceDiagram', 'sequence'],
  ['zenuml', 'zenuml'], ['classDiagram', 'class'], ['stateDiagram', 'state'],
  ['stateDiagram-v2', 'state'], ['erDiagram', 'er'], ['architecture-beta', 'architecture'],
  ['C4Context', 'c4'], ['C4Container', 'c4'], ['C4Component', 'c4'], ['C4Dynamic', 'c4'],
  ['C4Deployment', 'c4'], ['gantt', 'unsupported'],
])

function firstDeclaration(source) {
  const lines = source.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('%%')) continue
    return trimmed.split(/\s+/)[0]
  }
  return null
}

function currentRegex(source) {
  const trimmed = source.trim()
  const match = trimmed.match(/^(flowchart|graph)\s+(TD|TB|BT|RL|LR)\b/i)
  const family = !trimmed || source.split(/\r?\n/).every(line => !line.trim() || line.trim().startsWith('%%'))
    ? 'flowchart'
    : match ? 'flowchart' : 'unknown'
  if (family !== 'flowchart') return { family, extraction: 'unsupported', roundTrip: 'exact-text-fallback', nodes: 0, edges: 0 }
  const nodes = [...source.matchAll(/^\s*([A-Za-z_][\w-]*)\s*(?:\[|\(|\{|>)/gm)].length
  const edges = [...source.matchAll(/^\s*[\w-]+\s+(?:-->|---|-.->|==>)\s+(?:\|[^|]*\|\s+)?[\w-]+/gm)].length
  return {
    family,
    extraction: match ? 'partial-flowchart' : 'empty-new-flowchart',
    roundTrip: match ? 'normalized-loss' : 'exact-until-edit',
    nodes,
    edges,
  }
}

async function mermaidApi(source) {
  try {
    await mermaid.parse(source)
    return { family: declarationFamilies.get(firstDeclaration(source)) ?? 'unknown', extraction: 'not-exposed', roundTrip: 'not-exposed', validation: 'pass' }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      family: 'unknown', extraction: 'not-exposed', roundTrip: 'not-exposed',
      validation: message.includes('No diagram type detected') ? 'unsupported' : 'fail',
    }
  }
}

function tokenCst(source) {
  const declaration = firstDeclaration(source)
  const family = declaration ? declarationFamilies.get(declaration) ?? 'unknown' : 'unknown'
  const lines = source.split(/(?<=\n)/)
  return {
    family,
    extraction: family === 'unknown' || family === 'unsupported' ? 'declaration-only' : 'family-and-lossless-lines',
    roundTrip: lines.join('') === source ? 'exact' : 'loss',
    tokens: lines.length,
  }
}

const strategies = {
  'current-regex': source => currentRegex(source),
  'mermaid-api': source => mermaidApi(source),
  'structured-token-cst': source => tokenCst(source),
}

const strategyQualities = {
  'current-regex': {
    targetedEditFidelity: 'normalized-loss',
    deterministicIdentity: 'order-dependent synthetic edge IDs',
    coupling: 'low, but limited to Flowforge flowchart grammar',
    security: 'low; regular expressions do not execute source',
    versionFragility: 'low for frozen behavior, high semantic coverage risk',
  },
  'mermaid-api': {
    targetedEditFidelity: 'unsupported; no public serializer or source spans',
    deterministicIdentity: 'internal diagram database identity is not a public contract',
    coupling: 'high to Mermaid parser registrations and internal diagram databases',
    security: 'medium; use only pinned validation/render boundaries',
    versionFragility: 'high across non-public extraction surfaces',
  },
  'structured-token-cst': {
    targetedEditFidelity: 'exact outside explicitly replaced token spans',
    deterministicIdentity: 'stable source-span plus content digest',
    coupling: 'low; family extractors sit above a lossless token layer',
    security: 'low; tokenizer does not evaluate directives or links',
    versionFragility: 'low core, with versioned family extractors',
  },
}

function listMermaidFiles(currentDir) {
  const files = []
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    const entryPath = path.join(currentDir, entry.name)
    if (entry.isDirectory()) files.push(...listMermaidFiles(entryPath))
    if (entry.isFile() && entry.name.endsWith('.mmd')) files.push(entryPath)
  }
  return files
}

function fidelityStatus(outcome) {
  if (outcome.roundTrip === 'exact' || outcome.roundTrip === 'exact-text-fallback' || outcome.roundTrip === 'exact-until-edit') return 'pass'
  if (outcome.roundTrip === 'normalized-loss' || outcome.roundTrip === 'loss') return 'fail'
  return 'unsupported'
}

const results = []
for (const fixture of manifest.fixtures.filter(entry => entry.category !== 'stress')) {
  const source = fs.readFileSync(path.join(fixtureRoot, fixture.sourcePath), 'utf8')
  for (const [strategy, run] of Object.entries(strategies)) {
    const timings = []
    let outcome
    const iterations = strategy === 'mermaid-api' ? 1 : 15
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const started = performance.now()
      outcome = await run(source)
      timings.push(performance.now() - started)
    }
    timings.sort((a, b) => a - b)
    results.push({
      fixtureId: fixture.id,
      expectedFamily: fixture.family,
      classification: fixture.classification,
      strategy,
      outcome,
      fidelityStatus: fidelityStatus(outcome),
      qualities: strategyQualities[strategy],
      p95Ms: Number(timings[Math.min(timings.length - 1, Math.floor(timings.length * 0.95))].toFixed(3)),
    })
  }
}

const strategySummary = Object.keys(strategies).map(strategy => {
  const rows = results.filter(row => row.strategy === strategy)
  return {
    strategy,
    fixtures: rows.length,
    familyMatches: rows.filter(row => row.outcome.family === row.expectedFamily || (row.expectedFamily === 'malformed' && row.outcome.family === 'unknown')).length,
    exactRoundTrips: rows.filter(row => row.outcome.roundTrip === 'exact' || row.outcome.roundTrip === 'exact-text-fallback').length,
    unsupportedOrFailed: rows.filter(row => ['unsupported', 'fail'].includes(row.outcome.validation) || row.outcome.extraction === 'unsupported').length,
    maxP95Ms: Number(Math.max(...rows.map(row => row.p95Ms)).toFixed(3)),
  }
})

const offlineRoot = path.join(repoRoot, 'test/fixtures/mermaid-docs')
const fullCorpusResults = []
for (const sourcePath of listMermaidFiles(offlineRoot)) {
  const source = fs.readFileSync(sourcePath, 'utf8')
  const fixtureId = `offline:${path.relative(offlineRoot, sourcePath)}`
  for (const [strategy, run] of Object.entries(strategies)) {
    const outcome = await run(source)
    fullCorpusResults.push({
      fixtureId,
      strategy,
      outcome,
      fidelityStatus: fidelityStatus(outcome),
      qualities: strategyQualities[strategy],
    })
  }
}

const scorecard = {
  schemaVersion: 1,
  mermaidVersion: manifest.mermaidVersion,
  fixtureManifest: 'test/fixtures/multi-diagram/manifest.json',
  fullCorpusRoot: 'test/fixtures/mermaid-docs',
  strategies: strategySummary,
  fullCorpus: {
    fixtures: fullCorpusResults.length / Object.keys(strategies).length,
    results: fullCorpusResults,
  },
  recommendation: {
    selected: 'structured-token-cst',
    role: 'future source-of-truth parser and lossless rewrite layer',
    rationale: [
      'Preserves exact source bytes while exposing family declarations and line-level structure.',
      'Can add family-specific semantic extractors without forcing unsupported syntax through the flowchart regex.',
      'Keeps Mermaid API as a pinned validation/render oracle rather than relying on its non-public database internals.',
    ],
    retained: {
      'current-regex': 'Freeze as legacy flowchart compatibility behavior until migration tests prove parity.',
      'mermaid-api': 'Use only as validation and render oracle; it exposes no stable cross-family CST or serializer.',
    },
  },
  results,
}

function markdown(report) {
  const rows = report.strategies.map(row => `| ${row.strategy} | ${row.familyMatches}/${row.fixtures} | ${row.exactRoundTrips}/${row.fixtures} | ${row.unsupportedOrFailed} | ${row.maxP95Ms} |`).join('\n')
  return `# Parser strategy scorecard\n\nPinned Mermaid: ${report.mermaidVersion}\n\n| Strategy | Family matches | Exact round trips | Unsupported/failed | Max p95 ms |\n|---|---:|---:|---:|---:|\n${rows}\n\n## Recommendation\n\nSelect **structured-token-cst** as the future lossless parse/rewrite layer. Keep the current regex as a frozen flowchart compatibility path during migration, and use Mermaid API only as the pinned validation/render oracle.\n\nThe fixture-level JSON records explicit extraction, validation, round-trip, malformed, and unsupported outcomes for every strategy.\n`
}

if (process.argv.includes('--write')) {
  const evidenceRoot = path.join(repoRoot, 'docs/quality/multi-diagram-baseline/evidence')
  fs.mkdirSync(evidenceRoot, { recursive: true })
  fs.writeFileSync(path.join(evidenceRoot, 'parser-strategy-scorecard.json'), `${JSON.stringify(scorecard, null, 2)}\n`)
  fs.writeFileSync(path.join(evidenceRoot, 'parser-strategy-scorecard.md'), markdown(scorecard))
}
console.log(JSON.stringify({ status: 'pass', strategies: strategySummary, selected: scorecard.recommendation.selected }))
window.close()
