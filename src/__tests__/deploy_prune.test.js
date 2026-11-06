import { describe, it, expect } from 'vitest'
import process from 'node:process'
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('../../', import.meta.url))
const python = [process.env.VIRTUAL_ENV && resolve(process.env.VIRTUAL_ENV, 'bin/python'),
  resolve(root, '.venv/bin/python'), resolve(root, 'venv/bin/python')]
  .find(p => p && existsSync(p)) || 'python3'

describe('additive deployment — real scratch-only filesystem fixtures', () => {
  // Run the Python suite once, not once per assertion or in every contract file.
  // It overrides all production paths and never invokes the deploy CLI.
  it('retains old chunks, publishes dependencies before HTML, and survives copy/replace failures', () => {
    const result = spawnSync(python, ['scripts/test_deploy_safe.py', '-v'], {
      cwd: root, encoding: 'utf8', timeout: 30000,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    })
    expect(result.error).toBeUndefined()
    expect(result.status, result.stdout + result.stderr).toBe(0)
    expect(result.stderr).toMatch(/Ran 4 tests/)
    expect(result.stderr).toMatch(/\bOK\b/)
  })
})
