# Prometheus placement

**Roadmap:** #18 / #34 follow-on  
**Phase:** B (with #18 stack work)  
**Supersedes:** roadmap Decisions log **#25** (Prom on data fragment for controller)

## Where / how (today)

Prometheus lives on the **observability** fragment (`docker-stack.obs.yml`), dual-homed **`eip-obs` + `eip-core`**, gated by `addons.observability.enabled`. Data fragment = mongo/redis/nats/SeaweedFS. Controller has no Prom query client. DT SyncConfigs/materialize includes AppStackFile; InjectExternalConfigs on app; catalog Groups updated.

## Correctness need

Controller Evaluate SoT is Moby + Redis Asynq + NATS health — **not** Prom. Keeping Prom always-on solely for a retired reason wastes lean footprint.

## Trade-offs

Obs-off installs lose Traefik Prom scrapes and Prom UI path; acceptable — not controller inputs.

## Outcome

**Locked.**

- **Landed:** Prometheus on observability fragment (`docker-stack.obs.yml`), gated by `addons.observability.enabled`; dual-home `eip-obs`+`eip-core`.
- Lean data fragment = mongo / redis / nats / SeaweedFS only.
- Controller binary: **no Prom query client in v1**.
- Promote live stack/network/config docs at Phase D — **done** 2026-08-09.
- Reject: keeping Prom always-on “just in case” while claiming controller independence.
