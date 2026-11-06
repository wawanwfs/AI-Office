"""Scratch-only regression tests for additive frontend publication."""
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location('safe_deploy', Path(__file__).with_name('deploy.py'))
assert SPEC is not None and SPEC.loader is not None
deploy = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(deploy)


class SafeDeployTests(unittest.TestCase):
    def setUp(self):
        self.scratch = tempfile.TemporaryDirectory(prefix='deploy-safe-')
        self.addCleanup(self.scratch.cleanup)
        self.root = Path(self.scratch.name)
        self.src = self.root / 'dist'
        self.dst = self.root / 'hq'
        self.src.mkdir()
        self.dst.mkdir()
        for name, value in (
            ('SRC_DIST', str(self.src)), ('DST_HQ', str(self.dst)),
            ('PRUNE_DIR', str(self.dst / '.pruned-assets')),
        ):
            override = patch.object(deploy, name, value)
            override.start()
            self.addCleanup(override.stop)
        self.put(self.dst, 'index.html', 'old entry')
        self.put(self.dst, 'assets/old-12345678.js', 'old lazy chunk')
        # Deliberately create index before assets: filesystem order is not safe.
        self.put(self.src, 'index.html', '<script src="/assets/new-abcdefgh.js"></script>')
        self.put(self.src, 'assets/new-abcdefgh.js', 'new chunk')

    def put(self, base, name, content):
        target = base / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)
        return target

    def test_partial_copy_failure_keeps_prior_entry_and_assets(self):
        self.put(self.src, 'assets/old-12345678.js', 'replacement')
        copy = deploy.shutil.copyfile

        def partial_copy(source, destination, *args, **kwargs):
            if Path(source).name == 'old-12345678.js':
                Path(destination).write_text('partial')
                raise OSError('injected partial write')
            return copy(source, destination, *args, **kwargs)

        with patch.object(deploy.shutil, 'copyfile', side_effect=partial_copy):
            with self.assertRaisesRegex(OSError, 'injected partial write'):
                deploy.sync_dist_to_hq()
        self.assertEqual((self.dst / 'index.html').read_text(), 'old entry')
        self.assertEqual((self.dst / 'assets/old-12345678.js').read_text(), 'old lazy chunk')
        self.assertFalse(any(p.name.endswith('.tmp') for p in self.dst.rglob('*')))

    def test_routine_deploy_retains_previous_chunks_and_never_prunes(self):
        self.put(self.dst, 'workbox-12345678.js', 'old root dependency')
        self.put(self.dst, 'previous.png', 'retained until maintenance')
        # Detect all automatic pruning, including otherwise harmless empty runs.
        with patch.object(deploy, 'prune_orphan_assets', wraps=deploy.prune_orphan_assets) as assets, \
             patch.object(deploy, 'prune_root_stale', wraps=deploy.prune_root_stale) as root, \
             patch.object(deploy, 'prune_root_png', wraps=deploy.prune_root_png) as png:
            result = deploy.deploy()
        self.assertEqual((self.dst / 'assets/old-12345678.js').read_text(), 'old lazy chunk')
        self.assertEqual((self.dst / 'workbox-12345678.js').read_text(), 'old root dependency')
        self.assertTrue((self.dst / 'previous.png').exists())
        self.assertFalse((self.dst / '.pruned-assets').exists())
        assets.assert_not_called()
        root.assert_not_called()
        png.assert_not_called()
        self.assertEqual(result, 0)  # Keep the imported API's integer prune count.
        self.assertEqual((self.dst / 'index.html').read_text(), (self.src / 'index.html').read_text())

    def test_dependencies_ready_before_any_html_and_index_published_last(self):
        for name in ('landing.html', 'nested/page.html', 'z-last.bin',
                     'assets/nested/lazy-abcdefgh.js', 'workbox-abcdefgh.js', 'sw.js'):
            self.put(self.src, name, 'new ' + name)
        replace = os.replace
        published = []
        dependencies = [p.relative_to(self.src) for p in self.src.rglob('*')
                        if p.is_file() and p.suffix != '.html']

        def observe_replace(temporary, target):
            temporary, target = Path(temporary), Path(target)
            relative = target.relative_to(self.dst)
            self.assertEqual(temporary.parent, target.parent)
            self.assertNotEqual(temporary, target)
            self.assertEqual(temporary.read_bytes(), (self.src / relative).read_bytes())
            self.assertEqual((self.dst / 'assets/old-12345678.js').read_text(), 'old lazy chunk')
            if target.suffix == '.html':
                for dependency in dependencies:
                    self.assertEqual((self.dst / dependency).read_bytes(),
                                     (self.src / dependency).read_bytes())
            if relative == Path('index.html'):
                self.assertEqual((self.dst / 'landing.html').read_text(), 'new landing.html')
                self.assertEqual((self.dst / 'nested/page.html').read_text(), 'new nested/page.html')
                self.assertEqual(target.read_text(), 'old entry')
            replace(temporary, target)
            published.append(relative)

        with patch.object(deploy.os, 'replace', side_effect=observe_replace):
            deploy.sync_dist_to_hq()
        expected = {p.relative_to(self.src) for p in self.src.rglob('*') if p.is_file()}
        self.assertEqual(set(published), expected)
        self.assertEqual(len(published), len(expected))
        self.assertEqual(published[-1], Path('index.html'))
        self.assertFalse(any(p.name.endswith('.tmp') for p in self.dst.rglob('*')))

    def test_failed_index_replace_preserves_prior_entry(self):
        replace = os.replace

        def fail_entry(temporary, target):
            if Path(target) == self.dst / 'index.html':
                self.assertEqual(Path(temporary).read_text(), (self.src / 'index.html').read_text())
                raise OSError('injected entry publish failure')
            replace(temporary, target)

        with patch.object(deploy.os, 'replace', side_effect=fail_entry):
            with self.assertRaisesRegex(OSError, 'entry publish failure'):
                deploy.deploy()
        self.assertEqual((self.dst / 'index.html').read_text(), 'old entry')
        self.assertEqual((self.dst / 'assets/old-12345678.js').read_text(), 'old lazy chunk')
        self.assertEqual((self.dst / 'assets/new-abcdefgh.js').read_text(), 'new chunk')
        self.assertFalse(any(p.name.endswith('.tmp') for p in self.dst.rglob('*')))


if __name__ == '__main__':
    unittest.main()
