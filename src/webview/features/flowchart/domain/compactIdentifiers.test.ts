import { describe, expect, it } from 'vitest'
import { allocateCompactIdentifier, isLegacyGeneratedIdentifier } from './compactIdentifiers'

describe('allocateCompactIdentifier', () => {
  it('allocates the first available identifier for each entity kind', () => {
    expect(allocateCompactIdentifier('node', new Set())).toBe('n1')
    expect(allocateCompactIdentifier('subgraph', new Set())).toBe('g1')
    expect(allocateCompactIdentifier('edge', new Set())).toBe('e1')
  })

  it('skips occupied identifiers and fills the first available gap', () => {
    const occupied = new Set(['n1', 'n2', 'n4', 'g1', 'e1'])

    expect(allocateCompactIdentifier('node', occupied)).toBe('n3')
    expect(allocateCompactIdentifier('subgraph', occupied)).toBe('g2')
    expect(allocateCompactIdentifier('edge', occupied)).toBe('e2')
  })
})

describe('isLegacyGeneratedIdentifier', () => {
  it('recognizes UUID-era generated node and subgraph identifiers', () => {
    expect(isLegacyGeneratedIdentifier('N_123e4567-e89b-12d3-a456-426614174000', 'node')).toBe(true)
    expect(isLegacyGeneratedIdentifier('SG_123e4567_e89b_12d3_a456_426614174000', 'subgraph')).toBe(true)
    expect(isLegacyGeneratedIdentifier('Lane_123e4567-e89b_12d3-a456_426614174000', 'subgraph')).toBe(true)
    expect(isLegacyGeneratedIdentifier('123e4567-e89b-12d3-a456-426614174000', 'node')).toBe(true)
  })

  it('preserves manual identifiers and rejects mismatched legacy prefixes', () => {
    expect(isLegacyGeneratedIdentifier('A', 'node')).toBe(false)
    expect(isLegacyGeneratedIdentifier('custom_node', 'node')).toBe(false)
    expect(isLegacyGeneratedIdentifier('SG_123e4567-e89b-12d3-a456-426614174000', 'node')).toBe(false)
    expect(isLegacyGeneratedIdentifier('N_123e4567-e89b-12d3-a456-426614174000', 'subgraph')).toBe(false)
  })
})
