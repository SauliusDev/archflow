import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const checker = path.resolve('scripts/check-architecture.mjs');

function writeFixture(root, files) {
  for (const [fileName, source] of Object.entries(files)) {
    const target = path.join(root, fileName);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, source);
  }
}

function checkFixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flowforge-architecture-'));
  try {
    writeFixture(root, files);
    return spawnSync(process.execPath, [checker], { cwd: root, encoding: 'utf8' });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function assertViolation(files, importer, target, rule) {
  const result = checkFixture(files);
  assert.notEqual(result.status, 0, 'fixture should violate the architecture boundary');
  assert.match(result.stderr, new RegExp(`${importer.replaceAll('/', '\\/')} -> ${target.replaceAll('/', '\\/')}: ${rule}`));
}

test('the source tree satisfies the dependency-direction rules', () => {
  const result = spawnSync(process.execPath, ['scripts/check-architecture.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('detects each dependency-direction rule in isolation', async (t) => {
  await t.test('shared code cannot depend on framework code', () => {
    assertViolation(
      { 'src/shared/contracts.ts': "import type { ReactNode } from 'react';\nexport type Contract = ReactNode;\n" },
      'src/shared/contracts.ts',
      'react',
      'shared code must not depend on UI, extension, or framework code',
    );
  });

  await t.test('feature domain cannot depend on framework code', () => {
    assertViolation(
      { 'src/webview/features/flowchart/domain/model.ts': "import { create } from 'zustand';\nexport const model = create;\n" },
      'src/webview/features/flowchart/domain/model.ts',
      'zustand',
      'feature domain code must not depend on UI, root state, frameworks, or another feature',
    );
  });

  await t.test('feature application cannot depend on root state', () => {
    assertViolation(
      {
        'src/webview/state/createStore.ts': 'export const useStore = {};\n',
        'src/webview/features/flowchart/application/command.ts': "import { useStore } from '../../../state/createStore';\nexport { useStore };\n",
      },
      'src/webview/features/flowchart/application/command.ts',
      'src/webview/state/createStore.ts',
      'feature application code must not depend on root state or another feature private file',
    );
  });

  await t.test('features cannot import another feature private file', () => {
    assertViolation(
      {
        'src/webview/features/class-diagram/domain/types.ts': 'export type ClassType = string;\n',
        'src/webview/features/flowchart/ui/consumer.ts': "import type { ClassType } from '../../class-diagram/domain/types';\nexport type Consumer = ClassType;\n",
      },
      'src/webview/features/flowchart/ui/consumer.ts',
      'src/webview/features/class-diagram/domain/types.ts',
      'features must import other features through their public index.ts',
    );
  });

  await t.test('store facade cannot expose flowchart domain types through a namespace import', () => {
    assertViolation(
      {
        'src/webview/features/flowchart/domain/types.ts': 'export type FlowDomain = string;\n',
        'src/webview/lib/store.ts': "export type { FlowDomain } from '../features/flowchart/domain/types';\n",
        'src/webview/features/settings/ui/consumer.ts': "import type * as Store from '../../../lib/store';\nexport type Consumer = Store.FlowDomain;\n",
      },
      'src/webview/features/settings/ui/consumer.ts',
      'src/webview/lib/store.ts',
      'flowchart or class domain types must not be imported from the store compatibility facade',
    );
  });

  await t.test('store facade cannot expose class domain types through an aliased import', () => {
    assertViolation(
      {
        'src/webview/features/class-diagram/domain/types.ts': 'export type ClassDomain = string;\n',
        'src/webview/lib/store.ts': "export type { ClassDomain } from '../features/class-diagram/domain/types';\n",
        'src/webview/features/settings/ui/consumer.ts': "import type { ClassDomain as RenamedClassDomain } from '../../../lib/store';\nexport type Consumer = RenamedClassDomain;\n",
      },
      'src/webview/features/settings/ui/consumer.ts',
      'src/webview/lib/store.ts',
      'flowchart or class domain types must not be imported from the store compatibility facade',
    );
  });

  await t.test('extension code cannot depend on webview implementation', () => {
    assertViolation(
      {
        'src/webview/lib/private.ts': 'export const privateImplementation = true;\n',
        'src/extension/extension.ts': "import { privateImplementation } from '../webview/lib/private';\nexport { privateImplementation };\n",
      },
      'src/extension/extension.ts',
      'src/webview/lib/private.ts',
      'extension code must not import webview implementation files',
    );
  });
});
