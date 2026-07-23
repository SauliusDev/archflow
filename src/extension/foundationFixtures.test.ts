import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { DiagramFamily } from '../shared/diagram-contracts'
import { detectDiagramFamily } from './diagramTypeDetector'

interface FixtureEntry {
  id: string
  path: string
  family: DiagramFamily
  expectedDeclaration: string
  provenance: string
}

const root = path.resolve(process.cwd(), 'test/fixtures/multi-diagram-foundation')
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')) as { mermaidVersion: string; fixtures: FixtureEntry[] }

describe('multi-diagram foundation fixture contract', () => {
  it('pins provenance and representative declarations to Mermaid 11.14.0', () => {
    expect(manifest.mermaidVersion).toBe('11.14.0')
    expect(manifest.fixtures.map(entry => entry.id)).toEqual(expect.arrayContaining([
      'flowchart-preamble', 'sequence', 'zenuml', 'class', 'state', 'er', 'architecture',
      'c4-context', 'unsupported-gantt', 'malformed', 'layout-v1', 'layout-v2',
    ]))
    for (const fixture of manifest.fixtures) {
      expect(fs.existsSync(path.resolve(process.cwd(), fixture.provenance)), fixture.id).toBe(true)
      expect(fs.existsSync(path.join(root, fixture.path)), fixture.id).toBe(true)
    }
  })

  for (const fixture of manifest.fixtures.filter(entry => entry.path.endsWith('.mmd'))) {
    it(`detects ${fixture.id} without mutating fixture bytes`, () => {
      const fixturePath = path.join(root, fixture.path)
      const before = fs.readFileSync(fixturePath)
      const detection = detectDiagramFamily(before.toString('utf8'))
      expect(detection.family).toBe(fixture.family)
      expect(detection.declaration?.toLowerCase()).toBe(fixture.expectedDeclaration.toLowerCase())
      expect(fs.readFileSync(fixturePath)).toEqual(before)
    })
  }
})
