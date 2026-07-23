import assert from 'node:assert/strict'
import test from 'node:test'

import {
  checkStressSet,
  expectedStressSet,
  generateFixture,
} from '../../scripts/multi-diagram/generate-stress.mjs'

test('two clean stress generations are byte-identical', () => {
  assert.deepEqual(expectedStressSet(), expectedStressSet())
})

test('every family has medium and large deterministic profiles with construct counts', () => {
  const generated = expectedStressSet()
  assert.equal(generated.length, 16)
  for (const entry of generated) {
    assert.ok(entry.seed > 0)
    assert.ok(entry.sha256.match(/^[a-f0-9]{64}$/))
    assert.ok(Object.keys(entry.counts).length > 0)
  }
})

test('intentional output drift reports family, profile, and seed details', () => {
  const original = generateFixture('flowchart', 'medium')
  const drifted = { ...original, source: `${original.source}%% intentional drift\n` }
  const errors = checkStressSet([drifted])
  assert.ok(errors.some(error => error.includes(`flowchart/medium/${original.seed}: byte drift`)))
})

test('checked-in stress set matches a clean regeneration', () => {
  assert.deepEqual(checkStressSet(), [])
})
