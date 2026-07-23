import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const baselineTests = fs.readdirSync(path.join(repoRoot, 'test/baseline')).filter(name => name.endsWith('.test.mjs')).map(name => `test/baseline/${name}`).sort()
const layers = [
  { id: 'schema-fixture-environment-evidence', command: ['node', ['scripts/multi-diagram/validate.mjs']], count: 29 },
  { id: 'deterministic-regeneration', command: ['node', ['scripts/multi-diagram/generate-stress.mjs']], count: 16 },
  { id: 'baseline-validator-tests', command: ['node', ['--test', ...baselineTests]], count: baselineTests.length },
  { id: 'parser-research', command: ['node', ['scripts/multi-diagram/parser-research.mjs']], count: 3 },
  { id: 'budgets', command: ['node_modules/.bin/vite-node', ['scripts/multi-diagram/benchmark.ts']], count: 5 },
  {
    id: 'host-characterization',
    command: ['npx', ['vitest', 'run', '--config', 'vitest.config.host.ts', 'src/extension/diagramTypeDetector.test.ts', 'src/extension/multiDiagramCharacterization.test.ts', 'src/extension/FlowforgeEditorProvider.test.ts']],
    count: 3,
  },
  {
    id: 'webview-characterization',
    command: ['npx', ['vitest', 'run', 'src/webview/features/flowchart/application/parser.test.ts', 'src/webview/features/flowchart/application/serializer.test.ts', 'src/webview/lib/embeddedLayout.test.ts', 'src/webview/lib/sync.test.ts', 'src/webview/lib/store.test.ts', 'src/webview/lib/multiDiagramBaseline.test.ts']],
    count: 6,
    env: { NODE_ENV: 'test' },
  },
]

const summary = {
  schemaVersion: 1,
  mutatesExpectations: false,
  layers: [],
  evidencePaths: [
    'docs/quality/multi-diagram-baseline/evidence/pre-change/baseline.json',
    'docs/quality/multi-diagram-baseline/evidence/curated-mermaid-probe.json',
    'docs/quality/multi-diagram-baseline/evidence/parser-strategy-scorecard.json',
    'docs/quality/multi-diagram-baseline/evidence/benchmark-results.json',
    'docs/quality/multi-diagram-baseline/evidence/interactive-readiness.json',
    'docs/quality/multi-diagram-baseline/evidence/vscode-ui-qa-runs.json',
    'docs/quality/multi-diagram-baseline/evidence/final-summary.json',
    'docs/quality/multi-diagram-baseline/environments.json',
  ],
}

for (const layer of layers) {
  const [executable, args] = layer.command
  const result = spawnSync(executable, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, ...layer.env },
    maxBuffer: 10 * 1024 * 1024,
  })
  summary.layers.push({ id: layer.id, status: result.status === 0 ? 'pass' : 'fail', count: layer.count })
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? '')
    process.stderr.write(result.stderr ?? '')
    console.log(JSON.stringify({ ...summary, status: 'fail' }))
    process.exitCode = result.status ?? 1
    break
  }
}

if (!process.exitCode) console.log(JSON.stringify({ ...summary, status: 'pass' }))
