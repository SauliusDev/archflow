import * as esbuild from 'esbuild'

const isWatch = process.argv.includes('--watch')

/** @type {import('esbuild').BuildOptions} */
const buildOptions = {
  entryPoints: ['src/extension/extension.ts'],
  bundle: true,
  outfile: 'out/extension.js',
  format: 'cjs',
  platform: 'node',
  external: ['vscode'],
  sourcemap: isWatch,
  minify: !isWatch,
}

if (isWatch) {
  const ctx = await esbuild.context(buildOptions).catch((err) => {
    process.stderr.write(`[esbuild] context error: ${err}\n`)
    process.exit(1)
  })

  const shutdown = async () => {
    await ctx.dispose()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  await ctx.watch().catch((err) => {
    process.stderr.write(`[esbuild] watch error: ${err}\n`)
    process.exit(1)
  })
  process.stdout.write('[esbuild] watching...\n')
} else {
  await esbuild.build(buildOptions).catch((err) => {
    process.stderr.write(`[esbuild] build error: ${err}\n`)
    process.exit(1)
  })
  process.stdout.write('[esbuild] build complete\n')
}
