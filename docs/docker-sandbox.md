# WFS PROJECT — Docker Sandbox

Requirement inti. Dokumen hidup.

## Status saat ini (Audit)

- `sandbox_exec.py` menargetkan container `wfs-agent-<agent_id>` dan perlu rewrite
  menjadi model per-proyek.
- **Docker belum aktif di VM wfs-agent-1** (tidak ada docker CLI/socket).
  → Blocker untuk Fase 5; perlu install/konfigurasi Docker.

## Desain target

### Workspace per proyek
```
/workspaces/{project-id}/
  src/ config/ package manifests/ Dockerfile|compose/ test/ build/
  logs/ docs/ metadata/ git/
```
- Persistent storage (bukan filesystem container sementara).
- Workspace di-mount read-only-safe; perubahan hanya lewat orchestration.

### Container lifecycle
Provision → prepare workspace → install deps → build → start → health check →
running → stop → restart → rebuild → inspect logs → cleanup → recover.

### Preview & port
- Dynamic port allocation (hindari bentrok antar proyek).
- Map port container → preview/reverse proxy. URL benar-benar dapat diakses.
- Health check HTTP; status ready/starting/unhealthy/stopped/failed.
- Tombol Start/Stop/Restart/Rebuild/Open Preview.
- Jika app remote: jangan tampilkan `localhost` server; gunakan host/reverse proxy benar.

### Database & service pendukung
- PostgreSQL/MySQL/Redis/queue/backend/frontend per kebutuhan proyek (provisioning dari config).
- DB preview development terpisah dari produksi; volume persistence + init scripts.

### Keamanan (least privilege)
- Tidak privileged mode. Tidak mount host filesystem luas. Tidak docker socket host.
- Tidak host networking tanpa alasan. Resource limits (CPU/RAM/storage).
- Batas proses/timeout/log. Batasi egress; hindari internal/metadata/secret services.
- User non-root dalam container. Pisahkan permission orchestration/agent/runtime.
- Sanitasi command/path/hostname; validasi path (anti traversal/symlink escape).
- Batasi ukuran file/upload/log/artefak. Audit log lifecycle + action sensitif.

### Mode sandbox
- Development Sandbox: config terbatas untuk development.
- Restricted Sandbox: lebih ketat untuk kode kurang tepercaya.
- Tidak boleh: agent AI execute arbitrary host commands tanpa policy enforcement.

## Catatan

Jangan klaim sandbox "sepenuhnya aman" hanya karena Docker. Dokumentasikan trust
boundary & hardening. Verifikasi isolasi minimal 2 proyek (file tidak bercampur,
port tidak bentrok, stop/restart tidak memengaruhi proyek lain).
