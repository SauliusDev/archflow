import { describe, expect, it } from 'vitest'
import { deriveSafeFallback, deriveSmartRoute, isSmartRouteClear } from './routing'

const source = { x: 0, y: 0 }
const target = { x: 240, y: 0 }
const blockingNode = { x: 90, y: -30, width: 60, height: 60 }

describe('deriveSmartRoute', () => {
  it('keeps clear routes direct and deterministic', () => {
    const input = { source, target, mode: 'straight' as const, nodeObstacles: [], edgeObstacles: [] }
    expect(deriveSmartRoute(input)).toEqual(deriveSmartRoute(input))
    expect(deriveSmartRoute(input)).toMatchObject({ detoured: false, fallback: false, points: [source, target], path: 'M 0 0 L 240 0' })
  })

  it.each(['straight', 'orthogonal', 'curved'] as const)('detours a %s route around a node without persisting route data', mode => {
    const input = { source, target, mode, nodeObstacles: [blockingNode], edgeObstacles: [] }
    const route = deriveSmartRoute(input)
    expect(route.detoured).toBe(true)
    expect(route.points.length).toBeGreaterThan(2)
    expect(route.points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true)
    expect(route.path).not.toBe('M 0 0 L 240 0')
    expect(Number.isFinite(route.label.x) && Number.isFinite(route.label.y)).toBe(true)
    expect(isSmartRouteClear(input, route.points)).toBe(true)
  })

  it('uses only right-angle segments for orthogonal detours', () => {
    const route = deriveSmartRoute({ source, target, mode: 'orthogonal', nodeObstacles: [blockingNode], edgeObstacles: [] })
    for (let index = 1; index < route.points.length; index += 1) {
      expect(route.points[index].x === route.points[index - 1].x || route.points[index].y === route.points[index - 1].y).toBe(true)
    }
  })

  it('recalculates from current node geometry after a node moves', () => {
    const blocked = deriveSmartRoute({ source, target, mode: 'straight', nodeObstacles: [blockingNode], edgeObstacles: [] })
    const clear = deriveSmartRoute({ source, target, mode: 'straight', nodeObstacles: [{ ...blockingNode, y: 120 }], edgeObstacles: [] })

    expect(blocked.detoured).toBe(true)
    expect(clear).toMatchObject({ detoured: false, points: [source, target] })
  })

  it('avoids a stable existing-edge obstacle when a finite detour exists', () => {
    const route = deriveSmartRoute({
      source, target, mode: 'straight', nodeObstacles: [],
      edgeObstacles: [{ start: { x: 120, y: -100 }, end: { x: 120, y: 100 } }],
    })
    expect(route.detoured).toBe(true)
    expect(route.fallback).toBe(false)
    expect(route.points.length).toBeGreaterThan(2)
    expect(isSmartRouteClear({ source, target, mode: 'straight', nodeObstacles: [], edgeObstacles: [{ start: { x: 120, y: -100 }, end: { x: 120, y: 100 } }] }, route.points)).toBe(true)
  })

  it('gives a return edge a separate lane instead of drawing over its outbound edge', () => {
    const outbound = { points: [source, target] }
    const route = deriveSmartRoute({
      source: target, target: source, mode: 'straight', nodeObstacles: [], edgeObstacles: [outbound],
    })

    expect(route.detoured).toBe(true)
    expect(route.points).not.toEqual([target, source])
    expect(route.points.some(point => point.x !== source.x)).toBe(true)
    expect(isSmartRouteClear({ source: target, target: source, mode: 'straight', nodeObstacles: [], edgeObstacles: [outbound] }, route.points)).toBe(true)
  })

  it.each(['straight', 'orthogonal', 'curved'] as const)('returns segments clear of node and existing-edge blockers for %s', mode => {
    const input = {
      source, target, mode, nodeObstacles: [blockingNode],
      edgeObstacles: [{ points: [{ x: 180, y: -100 }, { x: 180, y: 100 }] }],
    }
    const route = deriveSmartRoute(input)

    expect(isSmartRouteClear(input, route.points)).toBe(true)
  })

  it('chooses and validates an edge-aware fallback when a clear fallback exists', () => {
    const input = {
      source, target, mode: 'orthogonal' as const, nodeObstacles: [],
      edgeObstacles: [{ points: [{ x: 120, y: -100 }, { x: 120, y: 100 }] }],
    }
    const fallback = deriveSafeFallback(input)

    expect(isSmartRouteClear(input, fallback)).toBe(true)
    expect(fallback).not.toEqual([source, target])
  })

  it('returns a finite deterministic fallback when the bounded route has no candidate', () => {
    const input = {
      source, target, mode: 'orthogonal' as const,
      nodeObstacles: [{ x: -30, y: -50, width: 300, height: 100 }], edgeObstacles: [],
    }
    const route = deriveSmartRoute(input)
    expect(route).toEqual(deriveSmartRoute(input))
    expect(route.fallback).toBe(true)
    expect(route.path).not.toMatch(/NaN|Infinity/)
  })

  it('retains source and target grid coordinates under a large bounded coordinate set', () => {
    const input = {
      source: { x: 10000, y: 0 }, target: { x: 20000, y: 0 }, mode: 'orthogonal' as const,
      nodeObstacles: [...Array.from({ length: 40 }, (_, index) => ({ x: index * 10, y: -20, width: 5, height: 40 })), { x: 14990, y: -20, width: 20, height: 40 }], edgeObstacles: [],
    }
    const route = deriveSmartRoute(input)

    expect(route.points[0]).toEqual(input.source)
    expect(route.points.at(-1)).toEqual(input.target)
    expect(route.fallback).toBe(false)
  })

  it('keeps bounded dense inputs deterministic and returns finite route geometry', () => {
    const input = {
      source, target, mode: 'orthogonal' as const,
      nodeObstacles: Array.from({ length: 200 }, (_, index) => ({ x: 20 + index * 8, y: index % 2 ? -40 : 20, width: 4, height: 20 })),
      edgeObstacles: Array.from({ length: 200 }, (_, index) => ({ points: [{ x: index * 8, y: -80 }, { x: index * 8, y: 80 }] })),
    }
    const first = deriveSmartRoute(input)

    expect(first).toEqual(deriveSmartRoute(input))
    expect(first.points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true)
  })
})
