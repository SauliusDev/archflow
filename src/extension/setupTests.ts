import { vi } from 'vitest'
import { createVSCodeMock } from 'jest-mock-vscode'

// Mock the `vscode` module for all extension unit tests.
// This runs before any test file is imported, so every
// `import * as vscode from 'vscode'` in extension tests gets the mock.
vi.mock('vscode', () => ({
  ...createVSCodeMock(vi),
  RelativePattern: class RelativePattern {
    constructor(readonly base: unknown, readonly pattern: string) {}
  },
  env: {
    clipboard: {
      writeText: vi.fn().mockResolvedValue(undefined),
      readText: vi.fn().mockResolvedValue(''),
    },
  },
}))
