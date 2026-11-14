# WFS AI Office — Phase 32 systemd preview recovery

Start a new approved preview explicitly with `start-supervised`.
Run recovery as a separate service using `recover-supervised` only.
Never configure a retry to invoke `start-supervised`: a service
restart does not grant approval to start containers again.

The reference [systemd template](../examples/preview-operator/wfs-preview-recover%40.service)
is for a trusted Linux Docker operator. Provision the named operator
and a fixed per-instance executable at `/etc/wfs-preview/recover-<instance>`.
The executable should invoke the project Python and operator CLI with
`recover-supervised`, `--approved`, and the same explicit project,
state-root and trust flags as the original start. Keep all files in
operator-controlled paths. No preview token or port flag is required.
Use a distinct instance for each tenant and transfer from the initial
startup supervisor before attaching recovery. Do not run them together.

The service uses `KillMode=control-group` and `Restart=on-failure`
with rate limits. Verify the template with `systemd-analyze verify`
after provisioning paths and users. Enable it only for a deliberately
managed instance. A successful suspension exits normally and does not
trigger a restart. A missing instance or failed Docker check remains a
failure that needs operator attention.

A watched lease without the current Linux boot ID is denied even if
its persisted expiry has not elapsed. Older watched records without a
boot ID fail closed after upgrade. To read a watched registry, the
gateway needs the same Linux boot identity as the operator. Legacy
unwatched rows are unchanged. After a host reboot the service does not
auto-start the preview or PostgreSQL. The reference PostgreSQL data
directory is tmpfs, so the running database's data is preserved by a
policy stop but is not promised to survive a host reboot.

CI uses disposable transient units with the same restart and cgroup
semantics. Check `phase32_systemd_lease` in the runtime proof. A real
host reboot and durable database recovery remain outside this gate.
