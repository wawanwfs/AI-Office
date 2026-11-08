"""Phase 11: allowlisted, byte-verified Docker Compose build snapshot.

A private per-project staging tree is built exclusively from a v2 signed
manifest's bytes. Docker is pointed to that tree, never mutable source paths.
This narrows source TOCTOU but is NOT an immutable filesystem mount, OS
separation from hostile same-UID code, or an offline Docker dependency build.
"""
import hashlib
import hmac
import os
from pathlib import Path
import shutil
import stat
import tempfile

from preview_admission_v2 import (
    AdmissionDenied, REVIEWED_FILES, ReviewedPreviewAdmission, _frontend_inventory,
)


def _copy_verified(source, destination, expected, maximum):
    """Hash bytes from the SAME securely-opened fd used to stage the file."""
    if source.is_symlink() or not source.is_file() or source.resolve() != source:
        raise AdmissionDenied("snapshot source unsafe")
    flags = os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0)
    try:
        with os.fdopen(os.open(source, flags), "rb") as handle:
            info = os.fstat(handle.fileno())
            if not stat.S_ISREG(info.st_mode) or not 1 <= info.st_size <= maximum:
                raise AdmissionDenied("snapshot input size/type denied")
            data = handle.read(maximum + 1)
            if len(data) != info.st_size:
                raise AdmissionDenied("snapshot input changed while reading")
    except OSError as exc:
        raise AdmissionDenied("snapshot input unavailable") from exc
    if not hmac.compare_digest(hashlib.sha256(data).hexdigest(), expected):
        raise AdmissionDenied("snapshot input does not match signed digest")
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.is_symlink() or destination.exists():
        raise AdmissionDenied("snapshot destination unexpectedly exists")
    with destination.open("xb") as output:
        output.write(data)
    if os.name == "posix":
        destination.chmod(0o444)
    return len(data)


class ReviewedPreviewSnapshot:
    """One staged allowlisted Docker Compose root per reviewed project.

    Future lifecycle commands always use the same staged Compose file. A
    failed Docker operation retains the directory for manual reconciliation.
    """

    def __init__(self, source_directory, private_state_root, reviewed):
        self.source = Path(source_directory).absolute()
        self.repo = self.source.parent.parent
        self.state_root = Path(private_state_root).absolute()
        self.parent = self.state_root / "preview-snapshots"
        if self.state_root.is_symlink() or self.state_root.resolve() != self.state_root:
            raise AdmissionDenied("snapshot state root unsafe")
        self.reviewed = reviewed

    def path(self, project_id):
        name = hashlib.sha256(project_id.encode("ascii")).hexdigest()[:24]
        return self.parent / name / "examples/fullstack-preview/compose.yaml"

    def verify(self, project_id):
        path = self.path(project_id)
        if not path.is_file():
            raise AdmissionDenied("reviewed snapshot not staged")
        ReviewedPreviewAdmission(path.parent, self.reviewed)
        return path

    def stage(self, project_id):
        if self.parent.is_symlink():
            raise AdmissionDenied("snapshot staging parent symlinked")
        self.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        if self.parent.resolve() != self.parent:
            raise AdmissionDenied("snapshot staging parent unsafe")
        path = self.path(project_id)
        if path.parent.parent.parent.exists():
            return self.verify(project_id)
        # Create a complete temporary repo-shaped tree, verify, and publish
        # by atomic directory rename. Existing destination is never overwritten.
        temp = Path(tempfile.mkdtemp(dir=self.parent, prefix="unpublished-"))
        try:
            dest = temp / "examples/fullstack-preview"
            for filename in REVIEWED_FILES:
                _copy_verified(self.source / filename, dest / filename,
                               self.reviewed["sources"][filename], 512 * 1024)
            _copy_verified(self.repo / "package-lock.json",
                           temp / "package-lock.json",
                           self.reviewed["package_lock"], 8 * 1024 * 1024)
            _copy_verified(self.repo / "artifacts/fullstack-preview/sbom.cdx.json",
                           temp / "artifacts/fullstack-preview/sbom.cdx.json",
                           self.reviewed["sbom"], 16 * 1024 * 1024)
            assets = _frontend_inventory(
                self.repo / "artifacts/fullstack-preview/dist")
            if set(assets) != set(self.reviewed["frontend"]):
                raise AdmissionDenied("snapshot frontend inventory differs")
            for name, source in assets.items():
                _copy_verified(
                    source,
                    temp / "artifacts/fullstack-preview/dist" / name,
                    self.reviewed["frontend"][name], 32 * 1024 * 1024)
            ReviewedPreviewAdmission(dest, self.reviewed)
            final_root = path.parent.parent.parent
            if final_root.exists():
                raise AdmissionDenied("snapshot concurrent creation denied")
            try:
                os.replace(temp, final_root)
            except OSError as exc:
                raise AdmissionDenied("snapshot publication failed") from exc
        finally:
            if temp.exists():
                shutil.rmtree(temp)
        return self.verify(project_id)

    def discard_after_authorized_stop(self, project_id):
        path = self.verify(project_id)
        root = path.parent.parent.parent
        if root.parent != self.parent or root.is_symlink():
            raise AdmissionDenied("snapshot disposal root unsafe")
        shutil.rmtree(root)
