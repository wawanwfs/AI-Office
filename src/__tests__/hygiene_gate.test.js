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

// Importing the probe must not start Chrome or mutate the publication directory.
// All gate fixtures live in TemporaryDirectory; no production paths are read.
const fixtures = String.raw`
import importlib.util, json, tempfile, unittest
from pathlib import Path
spec = importlib.util.spec_from_file_location('probe', 'scripts/e2e_err_probe.py')
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)

class PublishedAssetsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='asset-gate-')
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.put('index.html', '<script src="/assets/current-abcdefgh.js?v=1"></script>')
        self.put('assets/current-abcdefgh.js', 'current')

    def put(self, name, content='fixture'):
        p = self.root / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content)

    def gate(self):
        before = {str(p.relative_to(self.root)): p.read_bytes()
                  for p in self.root.rglob('*') if p.is_file()}
        result = probe.published_asset_status(self.root)
        after = {str(p.relative_to(self.root)): p.read_bytes()
                 for p in self.root.rglob('*') if p.is_file()}
        self.assertEqual(before, after, 'gate must be read-only')
        return result

    def test_retained_hashes_are_allowed_without_count_limit(self):
        for n in range(30):
            self.put(f'assets/old-{n:08d}.js')
        self.assertTrue(self.gate()['ok'])

    def test_missing_current_reference_fails_even_with_same_basename_at_root(self):
        (self.root / 'assets/current-abcdefgh.js').unlink()
        self.put('current-abcdefgh.js')
        result = self.gate()
        self.assertFalse(result['ok'])
        self.assertIn('assets/current-abcdefgh.js', result['missing'])

    def test_workbox_sibling_without_extension_and_landing_css(self):
        self.put('sw.js', 'define(["./workbox-abcdefgh"],function(){});')
        self.put('landing.html', '<link href="/landing-abcdefgh.css" rel="stylesheet">')
        result = self.gate()
        self.assertFalse(result['ok'])
        self.assertEqual(set(result['missing']), {'workbox-abcdefgh.js', 'landing-abcdefgh.css'})
        self.put('workbox-abcdefgh.js')
        self.put('landing-abcdefgh.css')
        self.assertTrue(self.gate()['ok'])

    def test_sw_precache_and_nested_paths_are_checked(self):
        self.put('sw.js', 'precache([{url:"assets/nested/icon.png",revision:"a"},{"url":"icon-192.png"}]);')
        self.assertIn('assets/nested/icon.png', self.gate()['missing'])
        self.assertIn('icon-192.png', self.gate()['missing'])
        self.put('assets/nested/icon.png')
        self.put('icon-192.png')
        self.assertTrue(self.gate()['ok'])

    def test_external_urls_are_not_local_dependencies(self):
        self.put('landing.html', '<script src="https://cdn.example/remote.js"></script>')
        self.assertTrue(self.gate()['ok'])

    def test_missing_entry_fails_closed_and_evidence_is_bounded(self):
        (self.root / 'index.html').unlink()
        self.assertFalse(self.gate()['ok'])
        self.put('index.html', ''.join(f'<script src="/assets/{n:08d}.js"></script>' for n in range(100)))
        result = self.gate()
        self.assertFalse(result['ok'])
        self.assertEqual(result['missing_count'], 100)
        self.assertLessEqual(len(result['missing']), 20)
        self.assertLess(len(json.dumps(result)), 6000)

unittest.main(argv=['gate-fixtures'], verbosity=2)
`

describe('publication health gate — current dependencies, not orphan counts', () => {
  it('checks exact current paths, permits retained chunks, and reports bounded read-only evidence', () => {
    const result = spawnSync(python, ['-c', fixtures], {
      cwd: root, encoding: 'utf8', timeout: 30000,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    })
    expect(result.error).toBeUndefined()
    expect(result.status, result.stdout + result.stderr).toBe(0)
    expect(result.stderr).toMatch(/Ran 6 tests/)
  })
})
