export interface RoutingPoint {
  x: number
  y: number
}

export interface RoutingRect {
  x: number
  y: number
  width: number
  height: number
}

export interface RoutingEdgeObstacle {
  points?: readonly RoutingPoint[]
  start?: RoutingPoint
  end?: RoutingPoint
}

export type SmartRouteMode = 'straight' | 'orthogonal' | 'curved'

export interface SmartRouteInput {
  source: RoutingPoint
  target: RoutingPoint
  mode: SmartRouteMode
  nodeObstacles: readonly RoutingRect[]
  edgeObstacles: readonly RoutingEdgeObstacle[]
  clearance?: number
  forceDetour?: boolean
}

export interface SmartRoute {
  points: RoutingPoint[]
  detoured: boolean
  fallback: boolean
  path: string
  label: RoutingPoint
}

const DEFAULT_CLEARANCE = 20
const MAX_GRID_COORDINATES = 24
const MAX_SEARCH_STEPS = 1024
const MAX_NODE_OBSTACLES = 32
const MAX_EDGE_OBSTACLES = 32
const MAX_EDGE_SEGMENTS = 12
const MAX_VISIBLE_CANDIDATES = 96
const EPSILON = 0.0001

function isFinitePoint(point: RoutingPoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y)
}

function equalPoints(a: RoutingPoint, b: RoutingPoint): boolean {
  return Math.abs(a.x - b.x) < EPSILON && Math.abs(a.y - b.y) < EPSILON
}

function distance(a: RoutingPoint, b: RoutingPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function expand(rect: RoutingRect, clearance: number): RoutingRect {
  return { x: rect.x - clearance, y: rect.y - clearance, width: rect.width + clearance * 2, height: rect.height + clearance * 2 }
}

function pointInsideRect(point: RoutingPoint, rect: RoutingRect): boolean {
  return point.x > rect.x + EPSILON && point.x < rect.x + rect.width - EPSILON
    && point.y > rect.y + EPSILON && point.y < rect.y + rect.height - EPSILON
}

function segmentIntersectsRect(start: RoutingPoint, end: RoutingPoint, rect: RoutingRect): boolean {
  const deltaX = end.x - start.x
  const deltaY = end.y - start.y
  let enter = 0
  let exit = 1
  const checks: Array<[number, number]> = [
    [-deltaX, start.x - rect.x], [deltaX, rect.x + rect.width - start.x],
    [-deltaY, start.y - rect.y], [deltaY, rect.y + rect.height - start.y],
  ]
  for (const [p, q] of checks) {
    if (Math.abs(p) < EPSILON) {
      if (q < 0) return false
      continue
    }
    const ratio = q / p
    if (p < 0) enter = Math.max(enter, ratio)
    else exit = Math.min(exit, ratio)
    if (enter > exit) return false
  }
  return enter < 1 - EPSILON && exit > EPSILON && enter < exit - EPSILON
}

function orientation(a: RoutingPoint, b: RoutingPoint, c: RoutingPoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

function onSegment(a: RoutingPoint, b: RoutingPoint, point: RoutingPoint): boolean {
  return Math.min(a.x, b.x) - EPSILON <= point.x && point.x <= Math.max(a.x, b.x) + EPSILON
    && Math.min(a.y, b.y) - EPSILON <= point.y && point.y <= Math.max(a.y, b.y) + EPSILON
}

function segmentsIntersect(a: RoutingPoint, b: RoutingPoint, c: RoutingPoint, d: RoutingPoint): boolean {
  const abC = orientation(a, b, c)
  const abD = orientation(a, b, d)
  const cdA = orientation(c, d, a)
  const cdB = orientation(c, d, b)
  if (((abC > EPSILON && abD < -EPSILON) || (abC < -EPSILON && abD > EPSILON))
    && ((cdA > EPSILON && cdB < -EPSILON) || (cdA < -EPSILON && cdB > EPSILON))) return true
  return (Math.abs(abC) < EPSILON && onSegment(a, b, c))
    || (Math.abs(abD) < EPSILON && onSegment(a, b, d))
    || (Math.abs(cdA) < EPSILON && onSegment(c, d, a))
    || (Math.abs(cdB) < EPSILON && onSegment(c, d, b))
}

function simplify(points: readonly RoutingPoint[]): RoutingPoint[] {
  return points.filter((point, index) => index === 0 || !equalPoints(point, points[index - 1]))
}

function edgePoints(edge: RoutingEdgeObstacle): RoutingPoint[] {
  const points = edge.points?.filter(isFinitePoint) ?? []
  if (points.length >= 2) return simplify(points).slice(0, MAX_EDGE_SEGMENTS + 1)
  return edge.start && edge.end && isFinitePoint(edge.start) && isFinitePoint(edge.end) ? [edge.start, edge.end] : []
}

function edgeSegments(edge: RoutingEdgeObstacle): Array<[RoutingPoint, RoutingPoint]> {
  const points = edgePoints(edge)
  return points.slice(1).map((point, index) => [points[index], point])
}

function pathIsClear(points: readonly RoutingPoint[], obstacles: readonly RoutingRect[], edgeObstacles: readonly RoutingEdgeObstacle[]): boolean {
  if (points.length < 2 || points.some(point => !isFinitePoint(point))) return false
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]
    const end = points[index]
    if (obstacles.some(rect => segmentIntersectsRect(start, end, rect))) return false
    if (edgeObstacles.some(edge => edgeSegments(edge).some(([edgeStart, edgeEnd]) => {
      // A single shared endpoint is a normal fan-in/fan-out connection.  Two
      // shared endpoints mean that the new segment sits directly on top of an
      // existing one (including a return edge in the opposite direction), so
      // it needs its own lane instead of becoming an unreadable round trip.
      const sharedEndpoints = [
        equalPoints(start, edgeStart), equalPoints(start, edgeEnd),
        equalPoints(end, edgeStart), equalPoints(end, edgeEnd),
      ].filter(Boolean).length
      if (sharedEndpoints === 1) return false
      return segmentsIntersect(start, end, edgeStart, edgeEnd)
    }))) return false
  }
  return true
}

function midpoint(points: readonly RoutingPoint[]): RoutingPoint {
  const total = points.slice(1).reduce((sum, point, index) => sum + distance(points[index], point), 0)
  let remaining = total / 2
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]
    const end = points[index]
    const length = distance(start, end)
    if (remaining <= length || index === points.length - 1) {
      const ratio = length < EPSILON ? 0 : remaining / length
      return { x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio }
    }
    remaining -= length
  }
  return points[0]
}

function linePath(points: readonly RoutingPoint[]): string {
  return `M ${points.map(point => `${point.x} ${point.y}`).join(' L ')}`
}

export function sampleRoutingPath(path: string): RoutingPoint[] {
  const tokens = path.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []
  const points: RoutingPoint[] = []
  let index = 0
  let command = ''
  let current = { x: 0, y: 0 }
  let cubicControl: RoutingPoint | undefined
  let quadraticControl: RoutingPoint | undefined
  const value = (): number | undefined => {
    const token = tokens[index]
    if (token === undefined || /^[a-zA-Z]$/.test(token)) return undefined
    index += 1
    const parsed = Number(token)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  const point = (): RoutingPoint | undefined => {
    const x = value()
    const y = value()
    return x === undefined || y === undefined ? undefined : { x, y }
  }
  const appendCurve = (next: RoutingPoint, controlA: RoutingPoint, controlB?: RoutingPoint): void => {
    const start = current
    for (let step = 1; step <= 12; step += 1) {
      const t = step / 12
      points.push(controlB
        ? { x: (1 - t) ** 3 * start.x + 3 * (1 - t) ** 2 * t * controlA.x + 3 * (1 - t) * t ** 2 * controlB.x + t ** 3 * next.x, y: (1 - t) ** 3 * start.y + 3 * (1 - t) ** 2 * t * controlA.y + 3 * (1 - t) * t ** 2 * controlB.y + t ** 3 * next.y }
        : { x: (1 - t) ** 2 * start.x + 2 * (1 - t) * t * controlA.x + t ** 2 * next.x, y: (1 - t) ** 2 * start.y + 2 * (1 - t) * t * controlA.y + t ** 2 * next.y })
    }
    current = next
  }
  while (index < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[index])) command = tokens[index++]
    if (!command) break
    const relative = command === command.toLowerCase()
    const kind = command.toUpperCase()
    if (kind === 'M' || kind === 'L') {
      const next = point()
      if (!next) break
      current = relative ? { x: current.x + next.x, y: current.y + next.y } : next
      points.push(current)
      if (kind === 'M') command = relative ? 'l' : 'L'
    } else if (kind === 'H' || kind === 'V') {
      const coordinate = value()
      if (coordinate === undefined) break
      current = kind === 'H' ? { x: relative ? current.x + coordinate : coordinate, y: current.y } : { x: current.x, y: relative ? current.y + coordinate : coordinate }
      points.push(current)
    } else if (kind === 'C') {
      const first = point()
      const second = point()
      const next = point()
      if (!first || !second || !next) break
      const start = current
      const resolvedFirst = relative ? { x: start.x + first.x, y: start.y + first.y } : first
      const resolvedSecond = relative ? { x: start.x + second.x, y: start.y + second.y } : second
      appendCurve(relative ? { x: start.x + next.x, y: start.y + next.y } : next, resolvedFirst, resolvedSecond)
      cubicControl = resolvedSecond
      quadraticControl = undefined
    } else if (kind === 'Q') {
      const control = point()
      const next = point()
      if (!control || !next) break
      const start = current
      const resolvedControl = relative ? { x: start.x + control.x, y: start.y + control.y } : control
      appendCurve(relative ? { x: start.x + next.x, y: start.y + next.y } : next, resolvedControl)
      quadraticControl = resolvedControl
      cubicControl = undefined
    } else if (kind === 'S' || kind === 'T') {
      const reflected = kind === 'S'
        ? (cubicControl ? { x: current.x * 2 - cubicControl.x, y: current.y * 2 - cubicControl.y } : current)
        : (quadraticControl ? { x: current.x * 2 - quadraticControl.x, y: current.y * 2 - quadraticControl.y } : current)
      if (kind === 'S') {
        const control = point()
        const next = point()
        if (!control || !next) break
        appendCurve(relative ? { x: current.x + next.x, y: current.y + next.y } : next, reflected, relative ? { x: current.x + control.x, y: current.y + control.y } : control)
      } else {
        const next = point()
        if (!next) break
        appendCurve(relative ? { x: current.x + next.x, y: current.y + next.y } : next, reflected)
      }
    } else if (kind === 'A') {
      const values = [value(), value(), value(), value(), value(), value(), value()]
      if (values.some(item => item === undefined)) break
      const next = { x: values[5]!, y: values[6]! }
      current = relative ? { x: current.x + next.x, y: current.y + next.y } : next
      points.push(current)
    } else if (kind === 'Z') {
      break
    } else break
  }
  return simplify(points)
}

function boundedCandidates(points: RoutingPoint[], required: readonly RoutingPoint[]): RoutingPoint[] {
  const unique = simplify(points)
  if (unique.length <= MAX_VISIBLE_CANDIDATES) return unique
  const retained = [...required]
  for (let index = 0; retained.length < MAX_VISIBLE_CANDIDATES && index < unique.length; index += 1) {
    if (!retained.some(point => equalPoints(point, unique[index]))) retained.push(unique[index])
  }
  return retained
}

function shortestVisiblePath(source: RoutingPoint, target: RoutingPoint, obstacles: readonly RoutingRect[], edgeObstacles: readonly RoutingEdgeObstacle[], clearance: number, forbidDirect: boolean): RoutingPoint[] | null {
  const candidates = boundedCandidates([
    source,
    target,
    ...obstacles.flatMap(rect => [
      { x: rect.x, y: rect.y }, { x: rect.x + rect.width, y: rect.y },
      { x: rect.x, y: rect.y + rect.height }, { x: rect.x + rect.width, y: rect.y + rect.height },
    ]),
    ...edgeObstacles.flatMap(edge => edgePoints(edge).flatMap(point => [
      { x: point.x - clearance, y: point.y - clearance }, { x: point.x + clearance, y: point.y - clearance },
      { x: point.x - clearance, y: point.y + clearance }, { x: point.x + clearance, y: point.y + clearance },
    ])),
  ], [source, target])
  const cost = candidates.map(() => Infinity)
  const previous = candidates.map(() => -1)
  const visited = candidates.map(() => false)
  cost[0] = 0
  for (let step = 0; step < candidates.length; step += 1) {
    let current = -1
    for (let index = 0; index < candidates.length; index += 1) {
      if (!visited[index] && (current === -1 || cost[index] < cost[current] - EPSILON || (Math.abs(cost[index] - cost[current]) < EPSILON && index < current))) current = index
    }
    if (current === -1 || !Number.isFinite(cost[current])) break
    if (current === 1) break
    visited[current] = true
    for (let next = 0; next < candidates.length; next += 1) {
      if (visited[next] || next === current || (forbidDirect && current === 0 && next === 1) || !pathIsClear([candidates[current], candidates[next]], obstacles, edgeObstacles)) continue
      const nextCost = cost[current] + distance(candidates[current], candidates[next])
      if (nextCost < cost[next] - EPSILON || (Math.abs(nextCost - cost[next]) < EPSILON && current < previous[next])) {
        cost[next] = nextCost
        previous[next] = current
      }
    }
  }
  if (!Number.isFinite(cost[1])) return null
  const path: RoutingPoint[] = []
  for (let index = 1; index !== -1; index = previous[index]) path.unshift(candidates[index])
  return path
}

function sortedCoordinates(values: number[], required: readonly number[]): number[] {
  const unique = [...new Set(values.filter(Number.isFinite))].sort((a, b) => a - b)
  if (unique.length <= MAX_GRID_COORDINATES) return unique
  const retained = [...new Set(required)].filter(Number.isFinite)
  const remaining = unique.filter(value => !retained.includes(value))
  const capacity = Math.max(0, MAX_GRID_COORDINATES - retained.length)
  for (let index = 0; index < capacity; index += 1) {
    const sample = remaining[Math.floor(index * remaining.length / capacity)]
    if (sample !== undefined) retained.push(sample)
  }
  return [...new Set(retained)].sort((a, b) => a - b)
}

function shortestOrthogonalPath(source: RoutingPoint, target: RoutingPoint, obstacles: readonly RoutingRect[], edgeObstacles: readonly RoutingEdgeObstacle[], clearance: number, forbidDirect: boolean): RoutingPoint[] | null {
  const xs = sortedCoordinates([source.x, target.x, ...obstacles.flatMap(rect => [rect.x, rect.x + rect.width]), ...edgeObstacles.flatMap(edge => edgePoints(edge).flatMap(point => [point.x - clearance, point.x + clearance]))], [source.x, target.x])
  const ys = sortedCoordinates([source.y, target.y, ...obstacles.flatMap(rect => [rect.y, rect.y + rect.height]), ...edgeObstacles.flatMap(edge => edgePoints(edge).flatMap(point => [point.y - clearance, point.y + clearance]))], [source.y, target.y])
  const points: RoutingPoint[] = []
  const indexByCoordinate = new Map<string, number>()
  for (const x of xs) for (const y of ys) {
    const point = { x, y }
    if (obstacles.some(rect => pointInsideRect(point, rect))) continue
    indexByCoordinate.set(`${x}:${y}`, points.length)
    points.push(point)
  }
  const sourceIndex = indexByCoordinate.get(`${source.x}:${source.y}`)
  const targetIndex = indexByCoordinate.get(`${target.x}:${target.y}`)
  if (sourceIndex === undefined || targetIndex === undefined) return null
  const cost = points.map(() => Infinity)
  const previous = points.map(() => -1)
  const visited = points.map(() => false)
  cost[sourceIndex] = 0
  const rowNeighbors = new Map<number, number[]>()
  const columnNeighbors = new Map<number, number[]>()
  for (let index = 0; index < points.length; index += 1) {
    const row = rowNeighbors.get(points[index].y) ?? []
    row.push(index)
    rowNeighbors.set(points[index].y, row)
    const column = columnNeighbors.get(points[index].x) ?? []
    column.push(index)
    columnNeighbors.set(points[index].x, column)
  }
  for (const row of rowNeighbors.values()) row.sort((a, b) => points[a].x - points[b].x)
  for (const column of columnNeighbors.values()) column.sort((a, b) => points[a].y - points[b].y)
  for (let step = 0; step < Math.min(MAX_SEARCH_STEPS, points.length); step += 1) {
    let current = -1
    for (let index = 0; index < points.length; index += 1) {
      if (!visited[index] && (current === -1 || cost[index] < cost[current] - EPSILON || (Math.abs(cost[index] - cost[current]) < EPSILON && index < current))) current = index
    }
    if (current === -1 || !Number.isFinite(cost[current])) break
    if (current === targetIndex) break
    visited[current] = true
    const row = rowNeighbors.get(points[current].y) ?? []
    const column = columnNeighbors.get(points[current].x) ?? []
    const rowIndex = row.indexOf(current)
    const columnIndex = column.indexOf(current)
    const neighbors = [row[rowIndex - 1], row[rowIndex + 1], column[columnIndex - 1], column[columnIndex + 1]].filter((next): next is number => next !== undefined)
    for (const next of neighbors) {
      if (visited[next] || (forbidDirect && current === sourceIndex && next === targetIndex)) continue
      if (!pathIsClear([points[current], points[next]], obstacles, edgeObstacles)) continue
      const nextCost = cost[current] + distance(points[current], points[next])
      if (nextCost < cost[next] - EPSILON || (Math.abs(nextCost - cost[next]) < EPSILON && current < previous[next])) {
        cost[next] = nextCost
        previous[next] = current
      }
    }
  }
  if (!Number.isFinite(cost[targetIndex])) return null
  const path: RoutingPoint[] = []
  for (let index = targetIndex; index !== -1; index = previous[index]) path.unshift(points[index])
  return simplify(path)
}

function curvedPath(points: readonly RoutingPoint[], obstacles: readonly RoutingRect[], edgeObstacles: readonly RoutingEdgeObstacle[]): string {
  if (points.length < 3) return linePath(points)
  const sampled: RoutingPoint[] = [points[0]]
  let path = `M ${points[0].x} ${points[0].y}`
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1]
    const corner = points[index]
    const next = points[index + 1]
    const before = { x: (previous.x + corner.x) / 2, y: (previous.y + corner.y) / 2 }
    const after = { x: (corner.x + next.x) / 2, y: (corner.y + next.y) / 2 }
    if (index === 1) path += ` L ${before.x} ${before.y}`
    path += ` Q ${corner.x} ${corner.y} ${after.x} ${after.y}`
    for (let step = 1; step <= 8; step += 1) {
      const t = step / 8
      sampled.push({ x: (1 - t) ** 2 * before.x + 2 * (1 - t) * t * corner.x + t ** 2 * after.x, y: (1 - t) ** 2 * before.y + 2 * (1 - t) * t * corner.y + t ** 2 * after.y })
    }
  }
  sampled.push(points[points.length - 1])
  return pathIsClear(sampled, obstacles, edgeObstacles) ? `${path} L ${points[points.length - 1].x} ${points[points.length - 1].y}` : linePath(points)
}

function fallbackPath(source: RoutingPoint, target: RoutingPoint, obstacles: readonly RoutingRect[], edgeObstacles: readonly RoutingEdgeObstacle[], clearance: number): RoutingPoint[] {
  const edgePointsList = edgeObstacles.flatMap(edgePoints)
  const top = Math.min(source.y, target.y, ...obstacles.map(rect => rect.y), ...edgePointsList.map(point => point.y)) - clearance * 3
  const bottom = Math.max(source.y, target.y, ...obstacles.map(rect => rect.y + rect.height), ...edgePointsList.map(point => point.y)) + clearance * 3
  const left = Math.min(source.x, target.x, ...obstacles.map(rect => rect.x), ...edgePointsList.map(point => point.x)) - clearance * 3
  const right = Math.max(source.x, target.x, ...obstacles.map(rect => rect.x + rect.width), ...edgePointsList.map(point => point.x)) + clearance * 3
  const candidates = [
    simplify([source, { x: source.x, y: top }, { x: target.x, y: top }, target]),
    simplify([source, { x: source.x, y: bottom }, { x: target.x, y: bottom }, target]),
    simplify([source, { x: left, y: source.y }, { x: left, y: target.y }, target]),
    simplify([source, { x: right, y: source.y }, { x: right, y: target.y }, target]),
  ]
  return candidates.find(candidate => pathIsClear(candidate, obstacles, edgeObstacles)) ?? candidates[0]
}

function parallelReturnLane(source: RoutingPoint, target: RoutingPoint, edgeObstacles: readonly RoutingEdgeObstacle[], clearance: number): RoutingPoint[] | null {
  const overlapsExistingSegment = edgeObstacles.some(edge => edgeSegments(edge).some(([start, end]) =>
    (equalPoints(source, start) && equalPoints(target, end))
    || (equalPoints(source, end) && equalPoints(target, start)),
  ))
  if (!overlapsExistingSegment) return null

  const dx = target.x - source.x
  const dy = target.y - source.y
  // Keep the return lane outside the normal label column. This matters most
  // in TD layouts, where request and response labels otherwise share a rank.
  const normal = Math.abs(dx) >= Math.abs(dy) ? { x: 0, y: -1 } : { x: 1, y: 0 }
  const laneDistance = Math.max(clearance, 96)
  return simplify([
    source,
    { x: source.x + normal.x * laneDistance, y: source.y + normal.y * laneDistance },
    { x: target.x + normal.x * laneDistance, y: target.y + normal.y * laneDistance },
    target,
  ])
}

function normalizedObstacles(input: SmartRouteInput): { clearance: number; obstacles: RoutingRect[]; edgeObstacles: RoutingEdgeObstacle[] } {
  const clearance = input.clearance ?? DEFAULT_CLEARANCE
  const obstacles = input.nodeObstacles
    .filter(rect => Number.isFinite(rect.x) && Number.isFinite(rect.y) && Number.isFinite(rect.width) && Number.isFinite(rect.height) && rect.width >= 0 && rect.height >= 0)
    .slice(0, MAX_NODE_OBSTACLES)
    .map(rect => expand(rect, clearance))
  const edgeObstacles = input.edgeObstacles.slice(0, MAX_EDGE_OBSTACLES).filter(edge => edgePoints(edge).length >= 2)
  return { clearance, obstacles, edgeObstacles }
}

export function isSmartRouteClear(input: SmartRouteInput, points: readonly RoutingPoint[]): boolean {
  const { obstacles, edgeObstacles } = normalizedObstacles(input)
  return pathIsClear(points, obstacles, edgeObstacles)
}

export function deriveSafeFallback(input: SmartRouteInput): RoutingPoint[] {
  const { clearance, obstacles, edgeObstacles } = normalizedObstacles(input)
  return fallbackPath(input.source, input.target, obstacles, edgeObstacles, clearance)
}

export function deriveSmartRoute(input: SmartRouteInput): SmartRoute {
  const { clearance, obstacles, edgeObstacles } = normalizedObstacles(input)
  const direct = [input.source, input.target]
  if (!isFinitePoint(input.source) || !isFinitePoint(input.target) || (!input.forceDetour && pathIsClear(direct, obstacles, edgeObstacles))) {
    return { points: direct, detoured: false, fallback: false, path: linePath(direct), label: midpoint(direct) }
  }
  const returnLane = input.forceDetour ? parallelReturnLane(input.source, input.target, edgeObstacles, clearance) : null
  if (returnLane && pathIsClear(returnLane, obstacles, edgeObstacles)) {
    return { points: returnLane, detoured: true, fallback: false, path: linePath(returnLane), label: midpoint(returnLane) }
  }
  const route = input.mode === 'orthogonal'
    ? shortestOrthogonalPath(input.source, input.target, obstacles, edgeObstacles, clearance, Boolean(input.forceDetour))
    : shortestVisiblePath(input.source, input.target, obstacles, edgeObstacles, clearance, Boolean(input.forceDetour))
  const points = route ?? deriveSafeFallback(input)
  return {
    points,
    detoured: true,
    fallback: route === null,
    path: input.mode === 'curved' ? curvedPath(points, obstacles, edgeObstacles) : linePath(points),
    label: midpoint(points),
  }
}
