import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('local release command builds, packages, and force-installs Flowforge', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
  const command = packageJson.scripts['release:local'];

  assert.ok(command, 'expected a release:local command');
  assert.match(command, /(?:pnpm|npm) run build/);
  assert.match(command, /@vscode\/vsce package/);
  assert.match(command, /--no-dependencies/);
  assert.match(command, /\.flowforge\/flowforge-local\.vsix/);
  assert.match(command, /code --install-extension .*--force/);
});
