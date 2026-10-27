"""Regression tests: all data and runtime dependencies are isolated."""
import asyncio
import pytest
import database
import tasks


@pytest.fixture
def isolated(tmp_path, monkeypatch):
    monkeypatch.setattr(tasks, 'DB', str(tmp_path / 'tasks.db'))
    monkeypatch.setattr(tasks, 'REPO', str(tmp_path / 'repo'))
    monkeypatch.setattr(database, 'DB_DIR', str(tmp_path))
    monkeypatch.setattr(database, 'DB_PATH', str(tmp_path / 'house.db'))
    database.init_db()
    async def no_network(*args, **kwargs):
        raise AssertionError('execution must not reach the network')
    monkeypatch.setattr(tasks, 'call_llm', no_network)
    return tasks.add_task('1', 'Test', 'pm', 'Test')


@pytest.mark.parametrize('approval', [None, 'pending', 'rejected'])
def test_direct_execution_requires_launch_approval(isolated, approval):
    if approval:
        aid = database.add_approval(project_id='1', action_type='project_launch')
        database.set_approval(aid, approval)
    with pytest.raises(PermissionError, match='project_launch'):
        asyncio.run(tasks.run_task(isolated))
    assert tasks.get_task(isolated)['status'] == 'pending'


@pytest.fixture
def server(isolated, monkeypatch):
    import fastapi.staticfiles
    monkeypatch.setattr(fastapi.staticfiles.StaticFiles, 'check_config', lambda self: None)
    import pathlib
    pathlib.Path(__file__).with_name('static').mkdir(exist_ok=True)
    import server
    server._bg_tasks.clear()
    return server


@pytest.mark.parametrize('entry', ['single', 'all', 'resume'])
def test_api_rejects_unapproved_without_scheduling(server, isolated, entry):
    from fastapi import HTTPException
    async def scenario():
        with pytest.raises(HTTPException) as exc:
            if entry == 'single':
                await server.api_run_task(isolated)
            elif entry == 'all':
                await server.api_run_all({})
            else:
                await server.api_resume_all({})
        assert exc.value.status_code == 403
        assert not server._bg_tasks
    asyncio.run(scenario())


def test_api_duplicate_before_background_starts(server, isolated):
    from fastapi import HTTPException
    approve()
    async def scenario():
        await server.api_run_task(isolated)
        try:
            with pytest.raises(HTTPException) as exc:
                await server.api_run_task(isolated)
            assert exc.value.status_code == 409
        finally:
            await server.api_pause_all()
        assert (await server.api_paused())['paused']
        assert tasks.is_paused()
        assert tasks.get_task(isolated)['status'] == 'pending'
    asyncio.run(scenario())


def test_same_project_names_have_unique_workspaces(server, monkeypatch):
    from docker_sandbox import DockerSandboxManager as SB
    monkeypatch.setattr(SB, 'scaffold_project', lambda *args: None)
    monkeypatch.setattr(SB, 'get_workspace_path', lambda slug: '/isolated/' + slug)
    monkeypatch.setattr(SB, 'start_container', lambda slug: {'status': 'starting'})
    async def scenario():
        first = await server.api_new_project({'name': 'Same Name', 'brief': 'test'})
        second = await server.api_new_project({'name': 'Same Name', 'brief': 'test'})
        a = database.get_project(str(first['project_id']))
        b = database.get_project(str(second['project_id']))
        assert a and b
        assert a['slug'] != b['slug']
        assert a['workspace_path'] != b['workspace_path']
        assert a['status'] == b['status'] == 'starting'
    asyncio.run(scenario())


@pytest.mark.parametrize('runtime', ['exited', 'running', 'unknown', 'missing'])
def test_project_listing_uses_runtime_not_cached_status(server, monkeypatch, runtime):
    from types import SimpleNamespace
    tasks.add_project('Test', 'Test')
    monkeypatch.setattr(database, 'list_projects', lambda: [
        {'id': '1', 'status': 'running', 'container_name': 'test-container'}])
    def inspect(*args, **kwargs):
        if runtime == 'unknown':
            raise OSError('docker unavailable')
        if runtime == 'missing':
            return SimpleNamespace(returncode=1, stdout='', stderr='Error: No such object: test-container')
        return SimpleNamespace(returncode=0, stdout=runtime, stderr='')
    monkeypatch.setattr(server.subprocess, 'run', inspect)
    result = asyncio.run(server.api_projects())
    assert result['projects'][0]['container_status'] == runtime


def test_completed_task_cannot_be_run_again(isolated):
    approve()
    tasks.set_status(isolated, 'done')
    with pytest.raises(RuntimeError, match='not runnable'):
        asyncio.run(tasks.run_task(isolated))
    assert tasks.get_task(isolated)['status'] == 'done'


def test_http_guards_and_pause_survive_restart(server, isolated):
    from fastapi.testclient import TestClient
    with TestClient(server.app) as client:
        assert client.post(f'/api/tasks/{isolated}/run').status_code == 403
        assert client.post('/api/tasks/run_all', json={}).status_code == 403
        assert client.post('/api/tasks/pause_all').status_code == 200
        assert client.post('/api/tasks/resume_all', json={}).status_code == 403
    with TestClient(server.app) as client:
        assert client.get('/api/tasks/paused').json() == {'paused': True}
        assert client.post(f'/api/tasks/{isolated}/run').status_code == 409


def test_approved_execution_finishes_and_releases_claim(isolated, monkeypatch):
    approve()
    async def answer(*args):
        return 'A test document'
    monkeypatch.setattr(tasks, 'call_llm', answer)
    monkeypatch.setattr(tasks, 'sync_sandbox', lambda *args: '')
    asyncio.run(tasks.run_task(isolated))
    assert tasks.get_task(isolated)['status'] == 'done'
    claim = tasks.claim_task(isolated)
    tasks.release_task(isolated, claim)


def test_recovery_does_not_reset_task_completed_during_scan(isolated, monkeypatch):
    tasks.set_status(isolated, 'running')
    original = tasks.claim_task
    def finish_then_claim(tid):
        tasks.set_status(tid, 'done')
        return original(tid)
    monkeypatch.setattr(tasks, 'claim_task', finish_then_claim)
    assert tasks.recover_interrupted() == 0
    assert tasks.get_task(isolated)['status'] == 'done'


def approve():
    aid = database.add_approval(project_id='1', action_type='project_launch')
    database.set_approval(aid, 'approved')


def test_duplicate_execution_and_cancellation_recovery(isolated, monkeypatch):
    approve()
    async def scenario():
        entered = asyncio.Event()
        async def blocked(*args):
            entered.set()
            await asyncio.Event().wait()
        monkeypatch.setattr(tasks, 'call_llm', blocked)
        first = asyncio.create_task(tasks.run_task(isolated))
        await entered.wait()
        try:
            with pytest.raises(RuntimeError, match='already running'):
                await tasks.run_task(isolated)
        finally:
            first.cancel()
            await asyncio.gather(first, return_exceptions=True)
        assert tasks.get_task(isolated)['status'] == 'pending'
    asyncio.run(asyncio.wait_for(scenario(), 2))


def test_persistent_pause_blocks_direct_runs(isolated):
    approve()
    tasks.set_paused(True)
    assert tasks.is_paused()
    with pytest.raises(RuntimeError, match='paused'):
        asyncio.run(tasks.run_task(isolated))
    assert tasks.get_task(isolated)['status'] == 'pending'


def test_recovery_resets_orphans_but_not_live_claims(isolated):
    approve()
    tasks.set_status(isolated, 'running')
    assert tasks.recover_interrupted() == 1
    assert tasks.get_task(isolated)['status'] == 'pending'
    claim = tasks.claim_task(isolated)
    try:
        assert tasks.recover_interrupted() == 0
    finally:
        tasks.release_task(isolated, claim)
