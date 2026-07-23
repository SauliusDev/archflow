import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const fixtureRoot = path.join(repoRoot, 'test/fixtures/multi-diagram')
const stressRoot = path.join(fixtureRoot, 'stress')
export const GENERATOR_VERSION = 1
export const FAMILIES = ['flowchart', 'sequence', 'zenuml', 'class', 'state', 'er', 'architecture', 'c4']
export const PROFILES = { medium: 80, large: 320 }

function sha256(text) {
  return createHash('sha256').update(text).digest('hex')
}

function seeded(seed) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

function familySeed(family, profile) {
  return [...`${family}:${profile}:flowforge`].reduce((value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0, 2166136261)
}

function flowchart(count, random) {
  const lines = ['%% generated deterministic stress fixture', 'flowchart TD', '  subgraph OUTER [Swimlane Outer]', '    subgraph INNER [Swimlane Inner]']
  for (let index = 0; index < Math.min(8, count); index += 1) lines.push(`      N${index}[Task ${index}]`)
  lines.push('    end', '  end')
  for (let index = 8; index < count; index += 1) lines.push(`  N${index}[Task ${index}-${Math.floor(random() * 1000)}]`)
  for (let index = 0; index < count - 1; index += 1) lines.push(`  N${index} --> N${index + 1}`)
  lines.push('  N0 --> N1', '  click N0 href "https://example.com"', '  classDef stress fill:#eef,stroke:#335')
  return { source: `${lines.join('\n')}\n`, counts: { nodes: count, edges: count, nestedSubgraphs: 2, repeatedEdges: 1, comments: 1, directives: 2, passthroughConstructs: 2 } }
}

function sequence(count, random) {
  const participants = Math.max(4, Math.floor(count / 10))
  const lines = ['sequenceDiagram']
  for (let index = 0; index < participants; index += 1) lines.push(`  participant P${index} as Participant ${index}`)
  for (let index = 0; index < count; index += 1) lines.push(`  P${index % participants}->>P${(index + 1) % participants}: message ${index}-${Math.floor(random() * 1000)}`)
  return { source: `${lines.join('\n')}\n`, counts: { participants, messages: count } }
}

function zenuml(count, random) {
  const participants = Math.max(4, Math.floor(count / 10))
  const lines = ['zenuml', '  title Deterministic stress']
  for (let index = 0; index < count; index += 1) lines.push(`  P${index % participants}->P${(index + 1) % participants}: message ${index}-${Math.floor(random() * 1000)}`)
  return { source: `${lines.join('\n')}\n`, counts: { participants, messages: count } }
}

function classDiagram(count, random) {
  const lines = ['classDiagram']
  for (let index = 0; index < count; index += 1) lines.push(`  class C${index} {`, `    +String value${Math.floor(random() * 1000)}`, '  }')
  for (let index = 0; index < count - 1; index += 1) lines.push(`  C${index} <|-- C${index + 1}`)
  return { source: `${lines.join('\n')}\n`, counts: { classes: count, members: count, relations: count - 1 } }
}

function stateDiagram(count) {
  const lines = ['stateDiagram-v2', '  [*] --> S0']
  for (let index = 0; index < count - 1; index += 1) lines.push(`  S${index} --> S${index + 1}: event${index}`)
  lines.push(`  S${count - 1} --> [*]`)
  return { source: `${lines.join('\n')}\n`, counts: { states: count, transitions: count + 1 } }
}

function erDiagram(count) {
  const lines = ['erDiagram']
  for (let index = 0; index < count; index += 1) lines.push(`  E${index} {`, '    string id', '  }')
  for (let index = 0; index < count - 1; index += 1) lines.push(`  E${index} ||--o{ E${index + 1} : links`)
  return { source: `${lines.join('\n')}\n`, counts: { entities: count, attributes: count, relations: count - 1 } }
}

function architecture(count) {
  const lines = ['architecture-beta', '  group platform(cloud)[Platform]']
  for (let index = 0; index < count; index += 1) lines.push(`  service S${index}(server)[Service ${index}] in platform`)
  for (let index = 0; index < count - 1; index += 1) lines.push(`  S${index}:R -- L:S${index + 1}`)
  return { source: `${lines.join('\n')}\n`, counts: { groups: 1, services: count, edges: count - 1 } }
}

function c4(count) {
  const lines = ['C4Context', '  title Deterministic stress context', '  Person(user, "User", "Uses the system")']
  for (let index = 0; index < count; index += 1) lines.push(`  System(S${index}, "System ${index}", "Generated system")`)
  lines.push('  Rel(user, S0, "Uses")')
  for (let index = 0; index < count - 1; index += 1) lines.push(`  Rel(S${index}, S${index + 1}, "Calls")`)
  return { source: `${lines.join('\n')}\n`, counts: { people: 1, systems: count, relations: count } }
}

const generators = { flowchart, sequence, zenuml, class: classDiagram, state: stateDiagram, er: erDiagram, architecture, c4 }

export function generateFixture(family, profile, seedOverride) {
  const count = PROFILES[profile]
  if (!FAMILIES.includes(family) || !count) throw new Error(`unknown stress fixture ${family}/${profile}`)
  const seed = seedOverride ?? familySeed(family, profile)
  const generated = generators[family](count, seeded(seed))
  return {
    id: `stress-${family}-${profile}`,
    family,
    profile,
    seed,
    generatorVersion: GENERATOR_VERSION,
    sourcePath: `stress/${family}-${profile}.mmd`,
    sha256: sha256(generated.source),
    byteLength: Buffer.byteLength(generated.source),
    validationExpectation: family === 'zenuml' ? 'unsupported' : 'valid',
    counts: generated.counts,
    source: generated.source,
  }
}

export function expectedStressSet() {
  return FAMILIES.flatMap(family => Object.keys(PROFILES).map(profile => generateFixture(family, profile)))
}

function summary(set) {
  return {
    schemaVersion: 1,
    generatorVersion: GENERATOR_VERSION,
    fixtures: set.map(({ source, ...entry }) => entry),
  }
}

function manifestEntry(entry) {
  const declaration = {
    flowchart: 'flowchart', sequence: 'sequenceDiagram', zenuml: 'zenuml', class: 'classDiagram',
    state: 'stateDiagram-v2', er: 'erDiagram', architecture: 'architecture-beta', c4: 'C4Context',
  }[entry.family]
  const expectedOutcome = entry.validationExpectation === 'valid'
    ? { validation: 'pass', render: 'pass' }
    : { validation: 'unsupported', render: 'unsupported' }
  return {
    id: entry.id,
    family: entry.family,
    declaration,
    category: 'stress',
    sourcePath: entry.sourcePath,
    provenance: { kind: 'generated', path: 'scripts/multi-diagram/generate-stress.mjs' },
    mermaidVersion: '11.14.0',
    sha256: entry.sha256,
    expected: expectedOutcome,
    consumingLayers: ['corpus', 'parser-research', 'benchmark'],
    classification: 'future-target',
    tags: ['stress', entry.profile],
  }
}

export function checkStressSet(set = expectedStressSet()) {
  const errors = []
  for (const entry of set) {
    const sourcePath = path.join(fixtureRoot, entry.sourcePath)
    if (!fs.existsSync(sourcePath)) errors.push(`${entry.family}/${entry.profile}/${entry.seed}: missing output`)
    else if (fs.readFileSync(sourcePath, 'utf8') !== entry.source) errors.push(`${entry.family}/${entry.profile}/${entry.seed}: byte drift`)
  }
  const expectedSummary = `${JSON.stringify(summary(set), null, 2)}\n`
  const summaryPath = path.join(stressRoot, 'summary.json')
  if (!fs.existsSync(summaryPath) || fs.readFileSync(summaryPath, 'utf8') !== expectedSummary) errors.push('stress summary drift')
  return errors
}

async function validatePinned(set) {
  const { JSDOM } = await import('jsdom')
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
  const { default: mermaid } = await import('mermaid')
  const errors = []
  for (const entry of set.filter(item => item.validationExpectation === 'valid')) {
    try {
      await mermaid.parse(entry.source)
    } catch (error) {
      errors.push(`${entry.family}/${entry.profile}/${entry.seed}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  dom.window.close()
  return errors
}

async function main() {
  const set = expectedStressSet()
  if (process.argv.includes('--write')) {
    fs.mkdirSync(stressRoot, { recursive: true })
    for (const entry of set) fs.writeFileSync(path.join(fixtureRoot, entry.sourcePath), entry.source)
    fs.writeFileSync(path.join(stressRoot, 'summary.json'), `${JSON.stringify(summary(set), null, 2)}\n`)
    const manifestPath = path.join(fixtureRoot, 'manifest.json')
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    manifest.fixtures = [...manifest.fixtures.filter(entry => entry.category !== 'stress'), ...set.map(manifestEntry)]
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  }
  const errors = [...checkStressSet(set), ...await validatePinned(set)]
  if (errors.length > 0) {
    for (const error of errors) console.error(error)
    process.exitCode = 1
    return
  }
  console.log(JSON.stringify({ status: 'pass', fixtures: set.length, generatorVersion: GENERATOR_VERSION }))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
