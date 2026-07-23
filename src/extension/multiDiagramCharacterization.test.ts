import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
import { detectDiagramType } from './diagramTypeDetector'

interface FixtureEntry {
  id: string
  family: string
  declaration: string
  category: string
  sourcePath: string
  classification: 'contract' | 'known-limitation' | 'future-target'
}

const fixtureRoot = path.resolve(process.cwd(), 'test/fixtures/multi-diagram')
const manifest = JSON.parse(
  fs.readFileSync(path.join(fixtureRoot, 'manifest.json'), 'utf8'),
) as { fixtures: FixtureEntry[] }

function currentExpectedType(fixture: FixtureEntry): 'flowchart' | 'unknown' {
  if (fixture.family === 'flowchart') return 'flowchart'
  if (fixture.declaration === 'empty' || fixture.declaration === 'comment-only') return 'flowchart'
  if (fixture.id === 'malformed-broken-flowchart') return 'flowchart'
  return 'unknown'
}

describe('LEGACY PROTOTYPE multi-diagram declaration characterization', () => {
  for (const fixture of manifest.fixtures.filter(entry => entry.category !== 'stress')) {
    it(`${fixture.classification}: ${fixture.id} resolves to the current custom-editor family`, () => {
      const sourcePath = path.join(fixtureRoot, fixture.sourcePath)
      const before = fs.readFileSync(sourcePath)

      expect(detectDiagramType(before.toString('utf8'))).toBe(currentExpectedType(fixture))
      expect(fs.readFileSync(sourcePath)).toEqual(before)
    })
  }

  it('known-limitation: malformed flowchart headers still pass the declaration gate', () => {
    const fixture = manifest.fixtures.find(entry => entry.id === 'malformed-broken-flowchart')!
    const source = fs.readFileSync(path.join(fixtureRoot, fixture.sourcePath), 'utf8')
    expect(detectDiagramType(source)).toBe('flowchart')
  })

  it('contract: empty and comment-only files remain new flowcharts', () => {
    for (const id of ['malformed-empty', 'malformed-comment-only']) {
      const fixture = manifest.fixtures.find(entry => entry.id === id)!
      const source = fs.readFileSync(path.join(fixtureRoot, fixture.sourcePath), 'utf8')
      expect(detectDiagramType(source)).toBe('flowchart')
    }
  })
})
