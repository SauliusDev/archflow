import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import { evaluateBudgets } from '../../scripts/multi-diagram/budgets.mjs'

const budgets = JSON.parse(fs.readFileSync(new URL('../../docs/quality/multi-diagram-baseline/budgets.json', import.meta.url)))
const passing = Object.entries(budgets.budgets).map(([id, budget]) => ({ id, [budget.statistic]: budget.maximumMs }))

test('budget evaluator accepts metrics exactly at immutable thresholds', () => {
  assert.deepEqual(evaluateBudgets(passing, budgets), [])
})

test('budget evaluator rejects a threshold violation', () => {
  const failing = passing.map(metric => metric.id === 'preview-render' ? { ...metric, p95Ms: 3000.001 } : metric)
  assert.match(evaluateBudgets(failing, budgets).join('\n'), /preview-render.*exceeds/)
})

test('budget evaluator rejects mutable or missing expectations', () => {
  assert.match(evaluateBudgets(passing, { ...budgets, immutable: false }).join('\n'), /immutable/)
  assert.match(evaluateBudgets(passing.slice(1), budgets).join('\n'), /missing metric/)
})

test('benchmark implementation never writes the budget document', () => {
  const source = fs.readFileSync(new URL('../../scripts/multi-diagram/benchmark.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /writeFileSync\([^\n]*budgets\.json/)
})
