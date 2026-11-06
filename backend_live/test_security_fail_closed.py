"""Behavior regressions: local handlers/files only, no shell, Docker or provider calls."""
import io
import json

import pytest
import wfs_api_service as api
import wfs_tasks as tasks


class Handler:
    def __init__(self, body):
        raw = json.dumps(body).encode()
        self.headers = {'Content-Length': str(len(raw)), 'X-WFS-Token': 'public-ui-token'}
        self.rfile = io.BytesIO(raw)
        self.wfile = io.BytesIO()
        self.status = None

    def send_response(self, status):
        self.status = status

    def send_header(self, *args):
        pass

    def end_headers(self):
        pass


@pytest.mark.parametrize('path,owner,name', [
    ('/api/projects/demo/terminal', api.DockerSandboxManager, 'run_command'),
    ('/api/tasks/demo/execute', api.TaskOrchestrator, 'execute_task'),
])
def test_legacy_execution_routes_are_disabled_even_with_ui_token(monkeypatch, path, owner, name):
    calls = []
    monkeypatch.setattr(owner, name, lambda *a: calls.append(a) or {})
    handler = Handler({'command': 'not-executed'})
    assert api.handle_api_request(handler, 'POST', path)
    assert handler.status == 410
    assert json.loads(handler.wfile.getvalue())['capability'] == 'disabled'
    assert calls == []


def test_project_list_safe_read_still_available(monkeypatch):
    monkeypatch.setattr(api, 'list_projects', lambda: [{'id': 'demo'}])
    handler = Handler({})
    assert api.handle_api_request(handler, 'GET', '/api/projects')
    assert handler.status == 200
    assert json.loads(handler.wfile.getvalue()) == {'projects': [{'id': 'demo'}]}


def test_host_shell_helper_is_disabled_before_workspace_or_subprocess(monkeypatch):
    import docker_sandbox
    def forbidden(*args, **kwargs):
        pytest.fail('disabled helper reached host execution/workspace')
    monkeypatch.setattr(api.DockerSandboxManager, 'get_workspace_path', forbidden)
    monkeypatch.setattr(docker_sandbox.subprocess, 'run', forbidden)
    with pytest.raises(PermissionError, match='disabled'):
        api.DockerSandboxManager.run_command('demo', 'not-executed')


def test_demo_orchestrator_is_disabled_before_database_access(monkeypatch):
    import orchestrator
    def forbidden():
        pytest.fail('disabled demo reached database')
    monkeypatch.setattr(orchestrator, 'get_db', forbidden)
    with pytest.raises(PermissionError, match='disabled'):
        api.TaskOrchestrator.execute_task('demo')


@pytest.mark.parametrize('writer', ['json', 'markdown'])
@pytest.mark.parametrize('escape', ['sibling', 'absolute', 'symlink'])
def test_output_writers_reject_paths_outside_repo(tmp_path, monkeypatch, writer, escape):
    repo = tmp_path / 'repo'
    outside = tmp_path / 'repo-other'
    repo.mkdir()
    outside.mkdir()
    (repo / 'external').symlink_to(outside, target_is_directory=True)
    monkeypatch.setattr(tasks, 'REPO', str(repo))
    path = {'sibling': '../repo-other/blocked.py',
            'absolute': str(outside / 'blocked.py'),
            'symlink': 'external/blocked.py'}[escape]
    code = '#' * 220
    if writer == 'json':
        tasks.write_json_files(1, json.dumps({'files': [{'path': path, 'code': code}]}))
    else:
        tasks.write_output_files(1, f'### FILE: {path}\n```python\n{code}\n```')
    assert not (outside / 'blocked.py').exists()


@pytest.mark.parametrize('writer', ['json', 'markdown'])
def test_output_writers_preserve_nested_file_writes(tmp_path, monkeypatch, writer):
    monkeypatch.setattr(tasks, 'REPO', str(tmp_path))
    code = '#' * 220
    if writer == 'json':
        written = tasks.write_json_files(1, json.dumps({'files': [{'path': 'app/main.py', 'code': code}]}))
    else:
        written = tasks.write_output_files(1, f'### FILE: app/main.py\n```python\n{code}\n```')
    assert written == ['app/main.py']
    assert (tmp_path / 'app/main.py').read_text().strip() == code


@pytest.mark.parametrize('escape', ['traversal', 'absolute', 'source_symlink', 'destination_symlink', 'agent_traversal'])
def test_sandbox_copy_rejects_escaping_paths(tmp_path, monkeypatch, escape):
    repo = tmp_path / 'repo'
    repo.mkdir()
    home = tmp_path / 'home'
    sandbox = home / 'wfs-office/sandboxes/be1/workspace'
    sandbox.mkdir(parents=True)
    outside = tmp_path / 'repo-other'
    outside.mkdir()
    source = outside / 'blocked.py'
    source.write_text('unchanged')
    (repo / 'external').symlink_to(outside, target_is_directory=True)
    (repo / 'app').mkdir()
    (repo / 'app/main.py').write_text('safe')
    (sandbox / 'app').symlink_to(outside, target_is_directory=True)
    agent = 'be1'
    path = {'traversal': '../repo-other/blocked.py', 'absolute': str(source),
            'source_symlink': 'external/blocked.py',
            'destination_symlink': 'app/main.py', 'agent_traversal': 'app/main.py'}[escape]
    if escape == 'agent_traversal':
        agent = '../escape'
        (home / 'wfs-office/escape/workspace').mkdir(parents=True)
    monkeypatch.setenv('HOME', str(home))
    monkeypatch.setattr(tasks, 'REPO', str(repo))
    response = tasks.sync_sandbox(agent, [path])
    assert response == '' or response.startswith('0 file')
    assert source.read_text() == 'unchanged'
    assert not (outside / 'main.py').exists()
    assert not (home / 'wfs-office/escape/workspace/app/main.py').exists()


def test_sandbox_copy_preserves_valid_nested_files(tmp_path, monkeypatch):
    repo = tmp_path / 'repo'
    (repo / 'app').mkdir(parents=True)
    (repo / 'app/main.py').write_text('safe')
    sandbox = tmp_path / 'wfs-office/sandboxes/be1/workspace'
    sandbox.mkdir(parents=True)
    monkeypatch.setenv('HOME', str(tmp_path))
    monkeypatch.setattr(tasks, 'REPO', str(repo))
    assert tasks.sync_sandbox('be1', ['app/main.py']).startswith('1 file')
    assert (sandbox / 'app/main.py').read_text() == 'safe'


@pytest.mark.parametrize('output', ['plain documentation', '### FILE: ../outside.py\n```\nblocked\n```'])
def test_documentation_fallback_cannot_follow_external_docs_symlink(tmp_path, monkeypatch, output):
    repo = tmp_path / 'repo'
    outside = tmp_path / 'outside'
    repo.mkdir()
    outside.mkdir()
    (repo / 'docs').symlink_to(outside, target_is_directory=True)
    monkeypatch.setattr(tasks, 'REPO', str(repo))
    assert tasks.write_output_files(1, output) == []
    assert list(outside.iterdir()) == []


@pytest.mark.parametrize('path', ['/etc/unused', '.', '../repo-other/file', 'loop/file'])
def test_contained_file_rejects_invalid_boundaries(tmp_path, path):
    (tmp_path / 'loop').symlink_to(tmp_path / 'loop')
    assert tasks._contained_file(tmp_path, path) is None


def test_execution_placeholder_cannot_follow_external_docs_symlink(tmp_path, monkeypatch):
    import asyncio
    repo = tmp_path / 'repo'
    outside = tmp_path / 'outside'
    repo.mkdir()
    outside.mkdir()
    (repo / 'docs').symlink_to(outside, target_is_directory=True)
    monkeypatch.setattr(tasks, 'REPO', str(repo))
    monkeypatch.setattr(tasks, 'get_task', lambda _: {
        'project': '1', 'agent_id': 'pm1', 'prompt': 'test', 'role': 'pm'})
    monkeypatch.setattr(tasks, 'require_launch_approval', lambda _: None)
    monkeypatch.setattr(tasks, 'set_status', lambda *a, **kw: None)
    monkeypatch.setattr(tasks, 'sync_sandbox', lambda *a: '')
    outputs = iter(['{"paths":["app/main.py"]}', '{}', '{}'])
    async def local_output(*args):
        return next(outputs)
    monkeypatch.setattr(tasks, '_execution_llm', local_output)
    asyncio.run(tasks._execute_task(1))
    assert list(outside.iterdir()) == []
