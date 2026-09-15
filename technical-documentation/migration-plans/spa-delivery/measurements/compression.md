# What compressing on every request costs

Measured 2026-09-15 against `assets/index-Dq5mesET.js`, the largest chunk in the build, 1 104 362
bytes raw.

| Encoding | Bytes | Time |
|----------|-------|------|
| brotli q6 — what the server does per request today | 298 674 | **36 ms, every request** |
| brotli q11 — what a build-time pass gives | 270 942 | 2 570 ms, once |
| gzip q6 | 324 479 | — |

The server spends 36 ms of CPU to produce a result **9 % larger** than the one a build step would
produce for free. A first load pulls fifteen to twenty chunks, so a cold visitor costs roughly a
third of a second of origin CPU and receives more bytes than necessary for it.

`createServer` in `frontend/deployment/server.js` compresses from source on every response; nothing
is retained between requests, so a second reader of the same chunk pays the same 36 ms again.

## The build's shape

162 files in `dist/assets`, 4.8 MB raw in the dev build. The twelve largest, with gzip -6 as the
comparison the image could measure locally:

| Raw | gzip | File |
|-----|------|------|
| 1 104 362 | 323 722 | `index-Dq5mesET.js` |
| 504 183 | 140 876 | `dialogueFrame-CKqnVxGW.js` |
| 454 904 | 126 933 | `Charts-B8BcwepC.js` |
| 336 625 | 98 360 | `loadingPage-D1y5FMfZ.js` |
| 227 038 | 62 200 | `DevtoolsComponent-CFsAhafd-8xSjZSGZ.js` |
| 153 320 | 43 384 | `useMobilePicker-D1L21wT6.js` |
| 148 823 | 34 845 | `layoutSelector-B-JDAvqd.js` |
| 133 186 | 42 751 | `Box-CH_w_oBU.js` |
| 103 517 | 23 102 | `LayoutSelector-BTtyOB35.js` |
| 93 738 | 23 793 | `groupFrame-wMesrAX9.js` |
| 81 053 | 24 598 | `MoreVert-Yzc9hqAn.js` |
| 68 898 | 14 284 | `reprocessingPage-BwAev2JI.js` |

The devtools chunk appears only because this was a dev build. `AppWrapper.jsx` gates the React Query
devtools import behind `import.meta.env.ENVIRONMENT === "development"`, so a production image does
not carry it — worth knowing before anyone reads 227 KB of devtools into a production bundle budget.

## Filenames, and why the cache tier matters here

Vite names each asset `<name>-<hash>.<ext>` with a **base64url** hash, not hex: `index-Dq5mesET.js`
locally, `index-jqgY9eWE.js` in the live build of the same entry.

The static server's versioned-asset test was `/[a-f0-9]{8,}/i`, which matched **0 of the 162** files
in a real build. Every hashed JavaScript and CSS file was therefore served as though it were
unversioned. The rule now anchors to the `-<hash>.<ext>` suffix, which also keeps `env.js` — rewritten
at every container start — out of the immutable tier.
