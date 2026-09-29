# Promotion draft — `testing/services/api.md`

Lands as one new row in § Coverage map → Tested of
[`technical-documentation/testing/services/api.md`](../../../../../testing/services/api.md),
after the `helper/cloudstoredesi` row. Nothing else in that file changes.

```markdown
| `v1endpoints` — system indexes | A system's cost indexes come back carrying the militia holding it, a system nobody holds reports none, and one ask for both keeps each answer to its own system |
```

The file is `services/api/v1endpoints/systemIndexMilitia_test.go`. It drives
`SystemIndexesHandler` over a fake Redis seeded with both datasets, so it covers the merge of
`militiaHolding` onto each answered row rather than the lookup alone.
