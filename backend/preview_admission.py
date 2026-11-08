"""Strict reviewed-template SHA-256 admission for the disposable preview operator.

Hash admission is operator confirmation of reviewed bytes; it is not a
signature, supply-chain attestation, sandboxing or permission to run arbitrary
AI-authored code. Never let a public request or LLM choose approved hashes.
"""
from pathlib import Path
import hashlib
import hmac
import re
import stat

REVIEWED_FILES=("compose.yaml","Dockerfile.api","api.py","ingress.py")
_SHA=re.compile(r"[a-f0-9]{64}\Z")


class AdmissionDenied(PermissionError):
    pass


class ReviewedPreviewAdmission:
    def __init__(self, directory, reviewed_files):
        root=Path(directory).absolute()
        if (root.is_symlink() or not root.is_dir() or
            root.resolve()!=root):
            raise AdmissionDenied("reviewed preview directory missing or unsafe")
        if (not isinstance(reviewed_files,dict) or
                set(reviewed_files)!=set(REVIEWED_FILES) or
                not all(isinstance(digest,str) and _SHA.fullmatch(digest)
                        for digest in reviewed_files.values())):
            raise AdmissionDenied("operator approved four exact source digests required")
        self.root=root
        self.reviewed_files=dict(reviewed_files)
        self.verify()

    def verify(self):
        """Recheck actual file bytes IMMEDIATELY before any Docker command."""
        for filename in REVIEWED_FILES:
            path=self.root/filename
            if (path.is_symlink() or not path.is_file() or
                    path.resolve()!=path):
                raise AdmissionDenied("reviewed runtime file is unsafe or missing")
            details=path.stat()
            if (not stat.S_ISREG(details.st_mode) or
                    not 1<=details.st_size<=512*1024):
                raise AdmissionDenied("reviewed runtime file size/type denied")
            hasher=hashlib.sha256()
            with path.open("rb") as source:
                for block in iter(lambda:source.read(1_048_576),b""):
                    hasher.update(block)
            if not hmac.compare_digest(self.reviewed_files[filename],hasher.hexdigest()):
                raise AdmissionDenied("reviewed runtime content changed since approval")
        return True
