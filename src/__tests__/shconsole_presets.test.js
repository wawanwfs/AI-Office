// Exercise the actual shell presets without Docker or project dependencies.
import { describe, it, expect } from 'vitest'
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const source = readFileSync(new URL('../components/ShConsole.jsx', import.meta.url), 'utf8')
const commands = [...source.matchAll(/'cd \/app && ([^'\n]+)'/g)].map((match) => match[1])
function run(kind, { packageFile = true, runner = true, exit = 0 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'sh-presets-'))
  try {
    if (packageFile) writeFileSync(join(dir, 'package.json'), '{}')
    if (runner) writeFileSync(join(dir, kind === 'py' ? 'python3' : 'npm'), `#!/bin/sh\necho runner-output\nexit ${exit}\n`, { mode: 0o755 })
    return spawnSync('/bin/sh', ['-c', commands[kind === 'py' ? 0 : 1]], { cwd: dir, env: { PATH: dir }, encoding: 'utf8' })
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
describe('workspace shell preset exit codes', () => {
  it.each(['py', 'node'])('%s preserves successful and failing runner statuses', (kind) => {
    expect(run(kind).status).toBe(0)
    const failed = run(kind, { exit: 5 })
    expect(failed.status).toBe(5)
    expect(failed.stdout).toContain('runner-output')
    expect(failed.stdout + failed.stderr).not.toContain('tidak ada package.json')
  })
  it('missing package is a nonzero prerequisite error, not a test failure', () => {
    const result = run('node', { packageFile: false })
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('tidak ada package.json')
    expect(result.stdout).not.toContain('runner-output')
  })
  it.each(['py', 'node'])('%s missing runner exits 127', (kind) => {
    expect(run(kind, { runner: false }).status).toBe(127)
  })
})
