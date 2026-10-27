"""Preview and workspace security regressions; no production data/network."""
import asyncio
import subprocess
import httpx
import pytest
from starlette.requests import Request
from test_execution_guards import isolated, server


def test_preview_only_forwards_application_headers(server, monkeypatch):
    monkeypatch.setattr(server.sh_db, 'get_project', lambda _: {'preview_port': 32001})
    seen = []
    real_client = httpx.AsyncClient
    def respond(request):
        seen.append(request)
        return httpx.Response(200, text='ok')
    monkeypatch.setattr(server.httpx, 'AsyncClient', lambda **kw: real_client(
        transport=httpx.MockTransport(respond), **kw))
    request = Request({'type': 'http', 'method': 'GET', 'path': '/',
                       'query_string': b'', 'headers': [
                           (b'cookie', b'dashboard=session'),
                           (b'authorization', b'Bearer dashboard'),
                           (b'x-wfs-token', b'dashboard-token'),
                           (b'x-api-key', b'dashboard-key'),
                           (b'referer', b'https://dashboard/?token=secret'),
                           (b'accept', b'text/html')]})
    assert asyncio.run(server.preview_proxy('demo', '', request)).status_code == 200
    assert seen[0].headers['accept'] == 'text/html'
    for name in ('cookie', 'authorization', 'x-wfs-token', 'x-api-key', 'referer'):
        assert name not in seen[0].headers


@pytest.mark.parametrize('location', ['http://169.254.169.254/latest/meta-data/',
                                     'http://127.0.0.1:8787/api/status', '/next'])
def test_preview_never_follows_redirects(server, monkeypatch, location):
    monkeypatch.setattr(server.sh_db, 'get_project', lambda _: {'preview_port': 32001})
    seen = []
    real_client = httpx.AsyncClient
    def respond(request):
        seen.append(str(request.url))
        if len(seen) == 1:
            return httpx.Response(302, headers={'location': location})
        return httpx.Response(200, text='internal secret')
    monkeypatch.setattr(server.httpx, 'AsyncClient', lambda **kw: real_client(
        transport=httpx.MockTransport(respond), **kw))
    request = Request({'type': 'http', 'method': 'GET', 'path': '/',
                       'query_string': b'', 'headers': []})
    response = asyncio.run(server.preview_proxy('demo', '', request))
    assert len(seen) == 1
    assert response.status_code == 502
    assert 'location' not in response.headers


@pytest.mark.parametrize('name', ['.env', '.env.production', '.git/config',
                                    '.ssh/id_rsa', 'server.pem', 'credentials.json'])
def test_workspace_denies_secrets(server, tmp_path, monkeypatch, name):
    monkeypatch.setattr(server, '_project_workspace', lambda _: (str(tmp_path), {}))
    secret = tmp_path / name
    secret.parent.mkdir(parents=True, exist_ok=True)
    secret.write_text('secret')
    with pytest.raises(server.HTTPException) as exc:
        server.api_project_file(1, name)
    assert exc.value.status_code == 403
    assert name.split('/')[0] not in [e['name'] for e in server.api_project_files(1)['entries']]


def test_workspace_hides_secret_and_external_symlink_targets(server, tmp_path, monkeypatch):
    base = tmp_path / 'workspace'
    base.mkdir()
    (base / '.env').write_text('secret')
    (tmp_path / 'outside').write_text('outside')
    (base / 'alias').symlink_to(base / '.env')
    (base / 'external').symlink_to(tmp_path / 'outside')
    (base / 'main.py').write_text('print(1)')
    monkeypatch.setattr(server, '_project_workspace', lambda _: (str(base), {}))
    assert [e['name'] for e in server.api_project_files(1)['entries']] == ['main.py']
    for name in ('alias', 'external'):
        with pytest.raises(server.HTTPException):
            server.api_project_file(1, name)
    assert server.api_project_file(1, 'main.py')['content'] == 'print(1)'


def git(base, *args):
    return subprocess.run(['git', '-C', str(base), *args], capture_output=True,
                          text=True, check=True).stdout


def init_repo(base):
    git(base, 'init', '-q')
    git(base, 'config', 'user.name', 'Test')
    git(base, 'config', 'user.email', 'test@example.invalid')


def test_commit_stages_only_safe_files(server, tmp_path, monkeypatch):
    init_repo(tmp_path)
    (tmp_path / '.env').write_text('secret')
    (tmp_path / 'private.key').write_text('secret')
    (tmp_path / 'main.py').write_text('print(1)')
    (tmp_path / 'alias').symlink_to(tmp_path / '.env')
    monkeypatch.setattr(server, '_project_workspace', lambda _: (str(tmp_path), {}))
    assert server.api_project_git_commit(1, {'message': 'safe'})['committed']
    assert git(tmp_path, 'ls-tree', '-r', '--name-only', 'HEAD').splitlines() == ['main.py']


def test_commit_rejects_pre_staged_secrets(server, tmp_path, monkeypatch):
    init_repo(tmp_path)
    (tmp_path / '.env').write_text('secret')
    git(tmp_path, 'add', '.env')
    monkeypatch.setattr(server, '_project_workspace', lambda _: (str(tmp_path), {}))
    with pytest.raises(server.HTTPException) as exc:
        server.api_project_git_commit(1, {'message': 'unsafe'})
    assert exc.value.status_code == 403
    assert git(tmp_path, 'diff', '--cached', '--name-only').strip() == '.env'


def test_commit_never_uses_parent_repository(server, tmp_path, monkeypatch):
    init_repo(tmp_path)
    base = tmp_path / 'child'
    base.mkdir()
    (tmp_path / 'outside.txt').write_text('private')
    monkeypatch.setattr(server, '_project_workspace', lambda _: (str(base), {}))
    with pytest.raises(server.HTTPException) as exc:
        server.api_project_git_commit(1, {'message': 'unsafe'})
    assert exc.value.status_code == 403
    assert git(tmp_path, 'diff', '--cached', '--name-only') == ''


def test_commit_supports_safe_dotfiles_deletions_and_literal_names(server, tmp_path, monkeypatch):
    init_repo(tmp_path)
    (tmp_path / '.gitignore').write_text('ignored.txt\n')
    (tmp_path / 'old.txt').write_text('old')
    git(tmp_path, 'add', '.gitignore', 'old.txt')
    git(tmp_path, 'commit', '-qm', 'initial')
    (tmp_path / 'old.txt').unlink()
    (tmp_path / ':(glob)*').write_text('literal')
    (tmp_path / 'ignored.txt').write_text('not staged')
    (tmp_path / '.env').write_text('secret')
    monkeypatch.setattr(server, '_project_workspace', lambda _: (str(tmp_path), {}))
    assert server.api_project_git_commit(1, {'message': 'update'})['committed']
    assert git(tmp_path, 'ls-tree', '-r', '--name-only', 'HEAD').splitlines() == ['.gitignore', ':(glob)*']
    assert not server.api_project_git_commit(1, {'message': 'empty'})['committed']
