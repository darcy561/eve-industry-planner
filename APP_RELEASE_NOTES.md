# App release notes (pending)

> **Replace this example before a Public app publish.** CI strips the `#` title above, prepends `## <version>`, then uses the rest as the GitHub Release body for `app-v*`.

### Highlights

- Short operator-facing summary of what changed in the app containers / stack
- Prefer one sentence per bullet; link issues when useful ([#123](https://github.com/darcy561/eve-industry-planner/issues/123))

### Changes

- **Added** — new behaviour operators will notice
- **Fixed** — bugfixes and regressions
- **Changed** — behaviour that may need a re-read of docs

### Operator notes

```bash
# After images are on GHCR, day-2 hosts:
eip update --stacks-only   # if stack YAML changed
eip up                     # or eip rebuild for local bake
```

### Upgrade

1. Set `APP_VERSION` to the published semver (or major.minor train).
2. Run `eip up` (or let Swarm pull on the next deploy).
3. Confirm services are healthy with `eip status`.
