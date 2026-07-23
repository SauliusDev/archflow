import { describe, expect, it } from 'vitest'
import type { CanvasDescriptor, LayoutStrategyInput } from '../../../../shared/diagram-contracts'
import { layoutStrategyRegistry } from '../../../lib/layoutStrategy'
import { classDagreStrategy, restoreClassLayout } from './layout'

const canvas: CanvasDescriptor = {
  elements: [
    { id: 'namespace:Domain', kind: 'container', label: 'Domain', focusable: true, selected: false, disabled: false, operations: [] },
    { id: 'class:Base', kind: 'element', label: 'Base', parentId: 'namespace:Domain', focusable: true, selected: false, disabled: false, operations: [] },
    { id: 'class:ConcreteA', kind: 'element', label: 'ConcreteA', parentId: 'namespace:Domain', focusable: true, selected: false, disabled: false, operations: [] },
    { id: 'class:ConcreteB', kind: 'element', label: 'ConcreteB', focusable: true, selected: false, disabled: false, operations: [] },
  ],
  connectors: [
    { id: 'inheritance', source: 'class:Base', target: 'class:ConcreteA', metadata: { type: 'inheritance' } },
    { id: 'realization', source: 'class:Base', target: 'class:ConcreteB', metadata: { type: 'realization' } },
    { id: 'association', source: 'class:ConcreteA', target: 'class:ConcreteB', metadata: { type: 'association' } },
  ],
}

function input(overrides: Partial<LayoutStrategyInput> = {}): LayoutStrategyInput {
  return {
    canvas,
    constraints: [],
    geometry: {
      'class:Base': { x: 0, y: 0, width: 280, height: 120 },
      'class:ConcreteA': { x: 0, y: 0, width: 220, height: 80 },
      'class:ConcreteB': { x: 0, y: 0, width: 180, height: 64 },
    },
    options: { reset: true },
    ...overrides,
  }
}

function overlaps(a: { x: number; y: number; width?: number; height?: number }, b: { x: number; y: number; width?: number; height?: number }): boolean {
  return a.x < b.x + (b.width ?? 0) && a.x + (a.width ?? 0) > b.x && a.y < b.y + (b.height ?? 0) && a.y + (a.height ?? 0) > b.y
}

describe('classDagreStrategy', () => {
  it('is registered and places supertypes above inheritance and realization targets without overlap', () => {
    expect(layoutStrategyRegistry.get('class-dagre')).toBe(classDagreStrategy)
    const result = classDagreStrategy.layout(input())
    const base = result.elements['class:Base']
    const concreteA = result.elements['class:ConcreteA']
    const concreteB = result.elements['class:ConcreteB']

    expect(base.y).toBeLessThan(concreteA.y)
    expect(base.y).toBeLessThan(concreteB.y)
    expect(overlaps(base, concreteA)).toBe(false)
    expect(overlaps(base, concreteB)).toBe(false)
    expect(overlaps(concreteA, concreteB)).toBe(false)
    expect(base).toMatchObject({ width: 280, height: 120 })
  })

  it('retains valid geometry without a reset while still placing missing class nodes', () => {
    const geometry = { 'class:Base': { x: 900, y: 800, width: 280, height: 120 } }
    const request = input({ geometry, options: {} })
    const result = classDagreStrategy.layout(request)
    expect(result.elements['class:Base']).toEqual(geometry['class:Base'])
    expect(result.elements['class:ConcreteA']).toBeDefined()
  })

  it('re-measures saved classes and de-overlaps them when their rendered boxes outgrow saved bounds', () => {
    const restored = restoreClassLayout(canvas, {
      'class:Base': { x: 20, y: 20, width: 120, height: 48 },
      'class:ConcreteA': { x: 100, y: 40, width: 120, height: 48 },
      'class:ConcreteB': { x: 180, y: 40, width: 120, height: 48 },
      'namespace:Domain': { x: 0, y: 0, width: 250, height: 180 },
    }, {
      'class:Base': { x: 20, y: 20, width: 280, height: 120 },
      'class:ConcreteA': { x: 100, y: 40, width: 220, height: 80 },
      'class:ConcreteB': { x: 180, y: 40, width: 180, height: 64 },
    })

    const classes = ['class:Base', 'class:ConcreteA', 'class:ConcreteB'].map(id => restored[id])
    expect(classes[0]).toMatchObject({ width: 280, height: 120 })
    for (let i = 0; i < classes.length; i += 1) {
      for (let j = i + 1; j < classes.length; j += 1) expect(overlaps(classes[i], classes[j])).toBe(false)
    }
  })
})
