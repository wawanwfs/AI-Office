"""Deny-by-default RBAC tests, no HTTP, no external auth assumptions."""
import pytest
from project_rbac import ProjectRBAC, AccessDenied


@pytest.fixture
def acl(tmp_path):
    a=ProjectRBAC(tmp_path/"rbac.db")
    a.bootstrap_owner("proj-a","alice")
    a.bootstrap_owner("proj-b","bob")
    a.set_role("alice","proj-a","runner","worker")
    a.set_role("alice","proj-a","editor","operator")
    a.set_role("alice","proj-a","watcher","viewer")
    return a


def test_default_deny_and_project_boundaries(acl):
    assert acl.require("alice","proj-a","budget")
    assert acl.require("runner","proj-a","run")
    with pytest.raises(AccessDenied):
        acl.require("runner","proj-b","run")
    with pytest.raises(AccessDenied):
        acl.require("watcher","proj-a","run")
    with pytest.raises(AccessDenied):
        acl.require("editor","proj-a","budget")


def test_owner_only_grants_and_last_owner_protected(acl):
    with pytest.raises(AccessDenied):
        acl.set_role("editor","proj-a","evil","owner")
    with pytest.raises(AccessDenied):
        acl.revoke("alice","proj-a","alice")
    acl.set_role("alice","proj-a","carol","owner")
    acl.revoke("carol","proj-a","alice")
    with pytest.raises(AccessDenied):
        acl.require("alice","proj-a","budget")


def test_bootstrap_fails_for_existing_project(acl):
    with pytest.raises(AccessDenied):
        acl.bootstrap_owner("proj-a","evil")
    assert len(acl.members("alice","proj-a"))==4


@pytest.mark.parametrize("bad",["../", "spaces not okay", "", "bad/name"])
def test_unsafe_principal_rejected(acl,bad):
    with pytest.raises(ValueError):
        acl.require(bad,"proj-a","read")


def test_unknown_action_denied(acl):
    with pytest.raises(ValueError):
        acl.require("alice","proj-a","screenshot-host-secrets")
