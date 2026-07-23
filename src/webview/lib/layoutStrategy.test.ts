import { describe, expect, it } from 'vitest'
import type { CanvasDescriptor, LayoutStrategyInput } from '../../shared/diagram-contracts'
import { LayoutStrategyRegistry, flowchartDagreStrategy } from './layoutStrategy'

const canvas: CanvasDescriptor = {
  elements: [
    { id: 'node:A', kind: 'element', label: 'A', focusable: true, selected: false, disabled: false, operations: [] },
    { id: 'node:B', kind: 'element', label: 'B', focusable: true, selected: false, disabled: false, operations: [] },
  ],
  connectors: [{ id: 'edge:A-B', source: 'node:A', target: 'node:B' }],
}

function input(overrides: Partial<LayoutStrategyInput> = {}): LayoutStrategyInput {
  return {
    canvas,
    constraints: [],
    geometry: {},
    options: {},
    ...overrides,
  }
}

describe('layout strategy registry', () => {
  it('registers and resolves a strategy while rejecting duplicate ids', () => {
    const registry = new LayoutStrategyRegistry([flowchartDagreStrategy])
    expect(registry.get('dagre')).toBe(flowchartDagreStrategy)
    expect(() => new LayoutStrategyRegistry([flowchartDagreStrategy, flowchartDagreStrategy])).toThrow(/duplicate/i)
  })

  it('returns equivalent geometry for equal immutable inputs', () => {
    const request = input()
    const frozen = JSON.stringify(request)
    const first = flowchartDagreStrategy.layout(request)
    const second = flowchartDagreStrategy.layout(request)
    expect(second).toEqual(first)
    expect(JSON.stringify(request)).toBe(frozen)
    expect(first.elements['node:A'].y).not.toBe(first.elements['node:B'].y)
  })

  it('preserves valid manual geometry and lays out only missing elements by default', () => {
    const result = flowchartDagreStrategy.layout(input({ geometry: { 'node:A': { x: 900, y: 800, width: 120, height: 60 } } }))
    expect(result.elements['node:A']).toEqual({ x: 900, y: 800, width: 120, height: 60 })
    expect(result.elements['node:B']).toBeDefined()
  })

  it('replaces retained geometry only for an explicit full reset', () => {
    const result = flowchartDagreStrategy.layout(input({
      geometry: { 'node:A': { x: 900, y: 800 } },
      options: { reset: true },
    }))
    expect(result.elements['node:A']).not.toMatchObject({ x: 900, y: 800 })
  })
})
