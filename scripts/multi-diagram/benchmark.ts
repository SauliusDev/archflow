import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'

import { detectDiagramType } from '../../src/extension/diagramTypeDetector'
import { embedLayoutInMermaid, stripEmbeddedLayout } from '../../src/webview/lib/embeddedLayout'
import { parseMermaidFlowchart } from '../../src/webview/features/flowchart/application/parser'
import { serialize } from '../../src/webview/features/flowchart/application/serializer'
import { evaluateBudgets } from './budgets.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const fixtureRoot = path.join(repoRoot, 'test/fixtures/multi-diagram')
const manifest = JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'manifest.json'), 'utf8'))
const budgets = JSON.parse(fs.readFileSync(path.join(repoRoot, 'docs/quality/multi-diagram-baseline/budgets.json'), 'utf8'))
const readiness = JSON.parse(fs.readFileSync(path.join(repoRoot, 'docs/quality/multi-diagram-baseline/evidence/interactive-readiness.json'), 'utf8'))

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true })
;(globalThis as any).window = dom.window
;(globalThis as any).document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
;(globalThis as any).HTMLElement = dom.window.HTMLElement
;(globalThis as any).SVGElement = dom.window.SVGElement
;(globalThis as any).HTMLCanvasElement = dom.window.HTMLCanvasElement
;(globalThis as any).screen = { width: 1440, height: 900, availWidth: 1440, availHeight: 900 }
;(globalThis as any).SVGElement.prototype.getBBox = function getBBox() {
  return { x: 0, y: 0, width: Math.max(24, (this.textContent ?? '').length * 8), height: 20 }
}
;(globalThis as any).SVGElement.prototype.getComputedTextLength = function getComputedTextLength() {
  return Math.max(24, (this.textContent ?? '').length * 8)
}
;(globalThis as any).HTMLCanvasElement.prototype.getContext = function getContext() {
  const context = { font: '', measureText: (text: unknown) => ({ width: String(text).length * 8 }) }
  return new Proxy(context, { get: (target, property) => property in target ? target[property as keyof typeof target] : () => undefined })
}
const { default: mermaid } = await import('mermaid')
mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function summarize(id: string, fixtureIds: string[], warmups: number[], samples: number[]) {
  const center = median(samples)
  return {
    id,
    fixtureIds,
    warmups: warmups.map(value => Number(value.toFixed(3))),
    samples: samples.map(value => Number(value.toFixed(3))),
    medianMs: Number(center.toFixed(3)),
    p95Ms: Number([...samples].sort((a, b) => a - b)[Math.ceil(samples.length * 0.95) - 1].toFixed(3)),
    madMs: Number(median(samples.map(value => Math.abs(value - center))).toFixed(3)),
  }
}

async function measure(id: string, fixtureIds: string[], operation: () => unknown | Promise<unknown>) {
  const warmups: number[] = []
  const samples: number[] = []
  for (let iteration = 0; iteration < 25; iteration += 1) {
    const started = performance.now()
    await operation()
    const duration = performance.now() - started
    ;(iteration < 5 ? warmups : samples).push(duration)
  }
  return summarize(id, fixtureIds, warmups, samples)
}

const sources = manifest.fixtures.map((fixture: { sourcePath: string }) => fs.readFileSync(path.join(fixtureRoot, fixture.sourcePath), 'utf8'))
const flowchartLarge = manifest.fixtures.find((fixture: { id: string }) => fixture.id === 'stress-flowchart-large')
const flowchartMedium = manifest.fixtures.find((fixture: { id: string }) => fixture.id === 'stress-flowchart-medium')
const largeSource = fs.readFileSync(path.join(fixtureRoot, flowchartLarge.sourcePath), 'utf8')
const mediumSource = fs.readFileSync(path.join(fixtureRoot, flowchartMedium.sourcePath), 'utf8')
const layout = { version: 1 as const, nodes: { N0: { x: 1, y: 2, width: 120, height: 44 } }, viewport: { x: 0, y: 0, zoom: 1 } }
let renderId = 0

const metrics = []
metrics.push(await measure('declaration-detection', manifest.fixtures.map((fixture: { id: string }) => fixture.id), () => {
  for (const source of sources) detectDiagramType(source)
}))
metrics.push(await measure('flowchart-pure-work', [flowchartLarge.id], () => {
  const parsed = parseMermaidFlowchart(largeSource)
  if ('error' in parsed) throw new Error(parsed.error)
  const normalized = serialize(parsed)
  stripEmbeddedLayout(embedLayoutInMermaid(normalized, layout))
}))
metrics.push(await measure('mermaid-validation', [flowchartLarge.id], async () => {
  await mermaid.parse(largeSource)
}))
metrics.push(await measure('preview-render', [flowchartMedium.id], async () => {
  const { svg } = await mermaid.render(`baseline-preview-${renderId++}`, mediumSource)
  if (!svg.includes('<svg')) throw new Error('Mermaid render produced no SVG')
  document.body.replaceChildren()
}))
metrics.push(summarize(
  'extension-interactive-readiness',
  [readiness.fixtureId],
  readiness.warmups,
  readiness.samples,
))

const baseline = JSON.parse(fs.readFileSync(path.join(repoRoot, 'docs/quality/multi-diagram-baseline/evidence/pre-change/baseline.json'), 'utf8'))
const report = {
  schemaVersion: 1,
  protocol: { serial: true, warmups: 5, measuredRuns: 20, statistics: ['medianMs', 'p95Ms', 'madMs'] },
  environment: {
    os: `${os.platform()} ${os.release()}`,
    architecture: os.arch(),
    cpu: os.cpus()[0]?.model ?? 'unknown',
    cpuCount: os.cpus().length,
    memoryBytes: os.totalmem(),
    node: process.versions.node,
    mermaid: manifest.mermaidVersion,
    vscode: baseline.environment.vscode,
  },
  budgetsPath: 'docs/quality/multi-diagram-baseline/budgets.json',
  metrics,
}
const errors = evaluateBudgets(metrics, budgets)
if (process.argv.includes('--write')) {
  fs.writeFileSync(
    path.join(repoRoot, 'docs/quality/multi-diagram-baseline/evidence/benchmark-results.json'),
    `${JSON.stringify({ ...report, status: errors.length === 0 ? 'pass' : 'fail', errors }, null, 2)}\n`,
  )
}
console.log(JSON.stringify({ status: errors.length === 0 ? 'pass' : 'fail', metrics: metrics.map(metric => ({ id: metric.id, medianMs: metric.medianMs, p95Ms: metric.p95Ms, madMs: metric.madMs })), errors }))
if (errors.length > 0) process.exitCode = 1
dom.window.close()
