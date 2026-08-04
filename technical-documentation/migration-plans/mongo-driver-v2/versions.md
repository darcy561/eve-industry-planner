# Version check — Mongo driver v2 + OTel

## A1/A2 landed pins (2026-08-02)

After A2 import rewrite + `go mod tidy` — **no v1 `mongo-driver`**.

| Module | Version |
|--------|---------|
| `go.mongodb.org/mongo-driver/v2` | **v2.8.0** |
| `…/mongo-driver/v2/mongo/otelmongo` | **v0.0.0-20260731133940-c4725f2810a9** |
| `go.opentelemetry.io/otel` | **v1.44.1-0.20260723093731-251b96b24897** |
| `go.opentelemetry.io/otel/sdk` | **v1.44.1-0.20260625150014-c84013202f01** |
| `…/otelhttp` | **v0.69.0** |
| `…/otelzap` | **v0.19.0** |

`SetMonitor` kept. Note: `otel@latest` tag is still v1.44.0; graph uses higher pseudo required by v2 otelmongo.

## Rule — pull latest at setup time

When Stage A1 runs, **re-resolve `@latest` then** — do **not** treat the historical snapshot table below as frozen pins.

1. `go get` **`@latest`** for `mongo-driver/v2` and v2 `otelmongo` (and let MVS pull required OTel).
2. Also bring other direct OTel contrib we use (`otelhttp`, `otelgrpc`, `otelzap`, OTLP exporters / sdk as needed) to **`@latest`** so nothing is left trailing.
3. Prefer **tagged releases** when proxy `@latest` is a tag. Pseudo-versions are OK **only** when that is what `@latest` is (today: v2 `otelmongo` has no tag yet).
4. After resolve: record the actual `go list -m` versions in this file (or overlay) and confirm no v1 `mongo-driver` / v1 `otelmongo` remain.

```text
go get go.mongodb.org/mongo-driver/v2@latest \
  go.opentelemetry.io/contrib/instrumentation/go.mongodb.org/mongo-driver/v2/mongo/otelmongo@latest \
  go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp@latest \
  go.opentelemetry.io/contrib/instrumentation/google.golang.org/grpc/otelgrpc@latest \
  go.opentelemetry.io/contrib/bridges/otelzap@latest \
  go.opentelemetry.io/otel@latest \
  go.opentelemetry.io/otel/sdk@latest \
  go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetricgrpc@latest \
  go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploggrpc@latest
```

If `@latest` for `otel` / `otel/sdk` is still an older **tag** than what v2 `otelmongo` requires, `go get` the otelmongo module first (or pin the higher pseudo that otelmongo demands) so the graph lands on the **newest versions that actually resolve together** — never stay on a lower tagged otel while otelmongo needs tip.

Then drop v1 requires, rewrite imports, `go mod tidy`.

---

## Snapshot (dry check 2026-08-02 — historical)

Checked via `proxy.golang.org` + dry `go get` in a temp module (`services/go.mod` unchanged). **Re-check before A1.**

### Today (`services/go.mod`)

| Module | Pin |
|--------|-----|
| `go.mongodb.org/mongo-driver` | **v1.17.9** |
| `…/mongo-driver/mongo/otelmongo` (v1 path) | **v0.69.0** |
| `go.opentelemetry.io/otel` | **v1.44.0** (tagged) |
| `…/otelhttp` / `…/otelgrpc` | **v0.69.0** |
| `…/bridges/otelzap` | **v0.19.0** |
| Go | **1.26.5** |

### Newest mutually compatible then

| Module | Version | Notes |
|--------|---------|--------|
| `go.mongodb.org/mongo-driver/v2` | **v2.8.0** | Proxy `@latest` |
| `…/mongo-driver/v2/mongo/otelmongo` | **v0.0.0-20260731133940-c4725f2810a9** | Proxy `@latest`; no tagged release yet |
| `go.opentelemetry.io/otel` | **v1.44.1-0.20260723093731-251b96b24897** | Required by that otelmongo; newer than tagged `v1.44.0` |
| `otel/trace`, `otel/metric`, `otel/sdk`, `otel/sdk/metric` | **v1.44.1-0.20260625150014-c84013202f01** | Required by that otelmongo |
| `…/otelhttp`, `…/otelgrpc` | **v0.69.0** | Latest tagged contrib at check time |
| `…/bridges/otelzap` | **v0.19.0** | Latest at check time |

### Findings from that check

1. Tagged `otel@v1.44.0` **will not** satisfy then-current v2 `otelmongo` — need the higher pseudo (or whatever `@latest` otelmongo requires on A1 day).
2. Proxy `@latest` for `otel` may still report the older tag; resolve **with** otelmongo so MVS takes the higher required versions.
3. No trailing v1 otelmongo; keep `SetMonitor`.
