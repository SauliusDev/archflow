import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const CATEGORIES = new Set([
  'minimal',
  'representative',
  'advanced-preservation',
  'malformed',
  'unsupported',
  'stress',
])
export const FAMILIES = new Set([
  'flowchart',
  'sequence',
  'zenuml',
  'class',
  'state',
  'er',
  'architecture',
  'c4',
  'unsupported',
  'malformed',
])
const CLASSIFICATIONS = new Set(['contract', 'known-limitation', 'future-target'])
const EXPECTED_OUTCOMES = new Set(['pass', 'fail', 'unsupported'])

function issue(pathName, message) {
  return { path: pathName, message }
}

export function sha256(content) {
  return createHash('sha256').update(content).digest('hex')
}

export function validateManifest(manifest, options = {}) {
  const rootDir = options.rootDir ?? process.cwd()
  const installedMermaidVersion = options.installedMermaidVersion
  const errors = []
  if (!manifest || typeof manifest !== 'object') return [issue('$', 'manifest must be an object')]
  if (manifest.schemaVersion !== 1) errors.push(issue('schemaVersion', 'schemaVersion must be 1'))
  if (typeof manifest.mermaidVersion !== 'string') errors.push(issue('mermaidVersion', 'mermaidVersion is required'))
  if (installedMermaidVersion && manifest.mermaidVersion !== installedMermaidVersion) {
    errors.push(issue('mermaidVersion', `stale Mermaid version: manifest=${manifest.mermaidVersion}, installed=${installedMermaidVersion}`))
  }
  if (!Array.isArray(manifest.fixtures)) return [...errors, issue('fixtures', 'fixtures must be an array')]

  const ids = new Set()
  for (const [index, fixture] of manifest.fixtures.entries()) {
    const base = `fixtures[${index}]`
    if (!fixture || typeof fixture !== 'object') {
      errors.push(issue(base, 'fixture must be an object'))
      continue
    }
    if (typeof fixture.id !== 'string' || !/^[a-z0-9][a-z0-9-]+$/.test(fixture.id)) {
      errors.push(issue(`${base}.id`, 'stable id must be kebab-case'))
    } else if (ids.has(fixture.id)) {
      errors.push(issue(`${base}.id`, `duplicate id: ${fixture.id}`))
    } else {
      ids.add(fixture.id)
    }
    if (!FAMILIES.has(fixture.family)) errors.push(issue(`${base}.family`, `missing or unknown family: ${fixture.family ?? '<missing>'}`))
    if (typeof fixture.declaration !== 'string' || fixture.declaration.length === 0) errors.push(issue(`${base}.declaration`, 'declaration is required'))
    if (!CATEGORIES.has(fixture.category)) errors.push(issue(`${base}.category`, `unknown category: ${fixture.category ?? '<missing>'}`))
    if (!CLASSIFICATIONS.has(fixture.classification)) errors.push(issue(`${base}.classification`, 'classification must be contract, known-limitation, or future-target'))
    if (fixture.mermaidVersion !== manifest.mermaidVersion) errors.push(issue(`${base}.mermaidVersion`, 'fixture Mermaid version must match manifest'))
    if (!fixture.provenance || typeof fixture.provenance.path !== 'string') errors.push(issue(`${base}.provenance`, 'provenance path is required'))
    if (!fixture.expected || !EXPECTED_OUTCOMES.has(fixture.expected.validation) || !EXPECTED_OUTCOMES.has(fixture.expected.render)) {
      errors.push(issue(`${base}.expected`, 'validation and render expectations are required'))
    }
    if (!Array.isArray(fixture.consumingLayers) || fixture.consumingLayers.length === 0) errors.push(issue(`${base}.consumingLayers`, 'at least one consuming layer is required'))
    if (!Array.isArray(fixture.tags)) errors.push(issue(`${base}.tags`, 'tags must be an array'))

    if (typeof fixture.sourcePath === 'string') {
      const sourcePath = path.resolve(rootDir, fixture.sourcePath)
      if (!sourcePath.startsWith(path.resolve(rootDir) + path.sep)) {
        errors.push(issue(`${base}.sourcePath`, 'source path escapes fixture root'))
      } else if (!fs.existsSync(sourcePath)) {
        errors.push(issue(`${base}.sourcePath`, `missing file: ${fixture.sourcePath}`))
      } else {
        const actual = sha256(fs.readFileSync(sourcePath))
        if (fixture.sha256 !== actual) errors.push(issue(`${base}.sha256`, `digest mismatch for ${fixture.id}`))
      }
    } else {
      errors.push(issue(`${base}.sourcePath`, 'sourcePath is required'))
    }
  }
  return errors
}

function listMermaidFiles(rootDir, currentDir = rootDir) {
  const files = []
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    const entryPath = path.join(currentDir, entry.name)
    if (entry.isDirectory()) files.push(...listMermaidFiles(rootDir, entryPath))
    if (entry.isFile() && entry.name.endsWith('.mmd')) files.push(path.relative(rootDir, entryPath))
  }
  return files
}

export function validateCorpusCoverage(manifest, options = {}) {
  const rootDir = options.rootDir ?? process.cwd()
  const repoRoot = options.repoRoot
  const requiredFamilies = options.requiredFamilies ?? ['flowchart', 'sequence', 'zenuml', 'class', 'state', 'er', 'architecture', 'c4']
  const requiredCategories = options.requiredCategories ?? ['minimal', 'representative', 'advanced-preservation', 'malformed', 'unsupported']
  const errors = []
  const fixtures = Array.isArray(manifest?.fixtures) ? manifest.fixtures : []
  const families = new Set(fixtures.map(fixture => fixture.family))
  const categories = new Set(fixtures.map(fixture => fixture.category))
  for (const family of requiredFamilies) {
    if (!families.has(family)) errors.push(issue('fixtures', `missing required family: ${family}`))
  }
  for (const category of requiredCategories) {
    if (!categories.has(category)) errors.push(issue('fixtures', `missing required category: ${category}`))
  }
  if (repoRoot) {
    for (const [index, fixture] of fixtures.entries()) {
      const provenancePath = fixture?.provenance?.path
      if (typeof provenancePath === 'string' && !fs.existsSync(path.resolve(repoRoot, provenancePath))) {
        errors.push(issue(`fixtures[${index}].provenance.path`, `provenance path is missing: ${provenancePath}`))
      }
    }
  }
  const classified = new Set(fixtures.map(fixture => fixture.sourcePath))
  for (const sourcePath of listMermaidFiles(rootDir)) {
    if (!classified.has(sourcePath)) errors.push(issue('fixtures', `unclassified input: ${sourcePath}`))
  }
  return errors
}

export function validateBaselineEvidence(evidence, options = {}) {
  const rootDir = options.rootDir ?? process.cwd()
  const errors = []
  if (!evidence || typeof evidence !== 'object') return [issue('$', 'baseline evidence must be an object')]
  if (evidence.schemaVersion !== 1) errors.push(issue('schemaVersion', 'schemaVersion must be 1'))
  if (!evidence.capturedAtUtc || Number.isNaN(Date.parse(evidence.capturedAtUtc))) errors.push(issue('capturedAtUtc', 'valid capture time is required'))
  for (const key of ['os', 'architecture', 'node', 'npm', 'vscode', 'mermaid']) {
    if (!evidence.environment || !evidence.environment[key]) errors.push(issue(`environment.${key}`, `${key} environment metadata is required`))
  }
  if (!Array.isArray(evidence.commands) || evidence.commands.length === 0) {
    errors.push(issue('commands', 'at least one command result is required'))
  } else {
    for (const [index, command] of evidence.commands.entries()) {
      if (typeof command.command !== 'string' || !Number.isInteger(command.exitCode)) errors.push(issue(`commands[${index}]`, 'command and integer exitCode are required'))
      if (typeof command.evidencePath !== 'string' || !fs.existsSync(path.resolve(rootDir, command.evidencePath))) errors.push(issue(`commands[${index}].evidencePath`, `evidence path is missing: ${command.evidencePath ?? '<missing>'}`))
    }
  }
  if (!Array.isArray(evidence.limitations)) errors.push(issue('limitations', 'limitations must be an array'))
  return errors
}

export function validateParserScorecard(scorecard, manifest, options = {}) {
  const repoRoot = options.repoRoot ?? process.cwd()
  const errors = []
  const fixtureIds = new Set((manifest?.fixtures ?? []).map(fixture => fixture.id))
  const selected = scorecard?.recommendation?.selected
  if (!scorecard || scorecard.schemaVersion !== 1) errors.push(issue('parserScorecard.schemaVersion', 'schemaVersion must be 1'))
  if (scorecard?.mermaidVersion !== manifest?.mermaidVersion) errors.push(issue('parserScorecard.mermaidVersion', 'scorecard and manifest Mermaid versions must match'))
  if (!scorecard?.strategies?.some(strategy => strategy.strategy === selected)) errors.push(issue('parserScorecard.recommendation.selected', 'selected strategy must resolve'))
  for (const [index, result] of (scorecard?.results ?? []).entries()) {
    if (!fixtureIds.has(result.fixtureId)) errors.push(issue(`parserScorecard.results[${index}].fixtureId`, `unknown fixture ID: ${result.fixtureId}`))
    if (String(result?.outcome?.roundTrip).includes('loss') && result.fidelityStatus !== 'fail') {
      errors.push(issue(`parserScorecard.results[${index}].fidelityStatus`, 'fidelity loss must be a failed result'))
    }
  }
  const offlineRoot = path.resolve(repoRoot, scorecard?.fullCorpusRoot ?? '')
  for (const [index, result] of (scorecard?.fullCorpus?.results ?? []).entries()) {
    const relative = String(result.fixtureId ?? '').replace(/^offline:/, '')
    if (!result.fixtureId?.startsWith('offline:') || !fs.existsSync(path.resolve(offlineRoot, relative))) {
      errors.push(issue(`parserScorecard.fullCorpus.results[${index}].fixtureId`, `offline fixture does not resolve: ${result.fixtureId}`))
    }
    if (String(result?.outcome?.roundTrip).includes('loss') && result.fidelityStatus !== 'fail') {
      errors.push(issue(`parserScorecard.fullCorpus.results[${index}].fidelityStatus`, 'fidelity loss must be a failed result'))
    }
  }
  return errors
}

export function validateEnvironmentMatrix(matrix, packageDocument, options = {}) {
  const repoRoot = options.repoRoot ?? process.cwd()
  const errors = []
  const packageFloor = String(packageDocument?.engines?.vscode ?? '').replace(/^[^0-9]*/, '')
  if (matrix?.declared?.vscodeFloor !== packageFloor) errors.push(issue('environments.declared.vscodeFloor', `expected package floor ${packageFloor}`))
  for (const [index, row] of (matrix?.rows ?? []).entries()) {
    const rowPath = `environments.rows[${index}]`
    if (row.status === 'verified') {
      if (row.observed !== true) errors.push(issue(`${rowPath}.observed`, 'verified row must be observed'))
      if (!Array.isArray(row.commands) || row.commands.length === 0) errors.push(issue(`${rowPath}.commands`, 'verified row requires commands'))
      for (const evidencePath of row.evidencePaths ?? []) {
        if (!fs.existsSync(path.resolve(repoRoot, evidencePath))) errors.push(issue(`${rowPath}.evidencePaths`, `missing evidence: ${evidencePath}`))
      }
      if (!Array.isArray(row.evidencePaths) || row.evidencePaths.length === 0) errors.push(issue(`${rowPath}.evidencePaths`, 'verified row requires evidence'))
    } else if (!['required-later', 'blocked'].includes(row.status)) {
      errors.push(issue(`${rowPath}.status`, `unsupported status: ${row.status}`))
    } else if (!row.successorChange) {
      errors.push(issue(`${rowPath}.successorChange`, 'non-verified row requires a responsible successor change'))
    }
  }
  return errors
}

function printErrors(errors) {
  for (const error of errors) console.error(`${error.path}: ${error.message}`)
}

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  const fixtureRoot = path.join(repoRoot, 'test/fixtures/multi-diagram')
  const manifest = JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'manifest.json'), 'utf8'))
  const baseline = JSON.parse(fs.readFileSync(path.join(repoRoot, 'docs/quality/multi-diagram-baseline/evidence/pre-change/baseline.json'), 'utf8'))
  const parserScorecard = JSON.parse(fs.readFileSync(path.join(repoRoot, 'docs/quality/multi-diagram-baseline/evidence/parser-strategy-scorecard.json'), 'utf8'))
  const environmentMatrix = JSON.parse(fs.readFileSync(path.join(repoRoot, 'docs/quality/multi-diagram-baseline/environments.json'), 'utf8'))
  const packageDocument = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
  const installedMermaidVersion = JSON.parse(fs.readFileSync(path.join(repoRoot, 'node_modules/mermaid/package.json'), 'utf8')).version
  const errors = [
    ...validateManifest(manifest, { rootDir: fixtureRoot, installedMermaidVersion }),
    ...validateCorpusCoverage(manifest, { rootDir: fixtureRoot, repoRoot }),
    ...validateBaselineEvidence(baseline, { rootDir: repoRoot }),
    ...validateParserScorecard(parserScorecard, manifest, { repoRoot }),
    ...validateEnvironmentMatrix(environmentMatrix, packageDocument, { repoRoot }),
  ]
  if (errors.length > 0) {
    printErrors(errors)
    process.exitCode = 1
    return
  }
  console.log(JSON.stringify({ status: 'pass', fixtures: manifest.fixtures.length, mermaidVersion: installedMermaidVersion }))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
