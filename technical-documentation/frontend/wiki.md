# Wiki help (SPA)

Live SoT for in-app Otter Wiki links and the theme cookie the wiki reads. Host / TLS / image → [stack wiki](../stack/wiki.md).

## Image & defaults

| Piece | Default | Change |
|-------|---------|--------|
| Help URL | `wiki.{window.location.hostname}/{path}` | [`getWikiUrl.js`](../../frontend/src/Functions/Helper/getWikiUrl.js) |
| Panel help icon | `wikiUrl` on ContentPanel | [`ContentPanel.jsx`](../../frontend/src/Styled%20Components/Paper/ContentPanel.jsx) |
| Theme cookie | `eip-theme` (`dark` / `light`) | [`ThemeContext.jsx`](../../frontend/src/Context/ThemeContext.jsx) `WIKI_THEME_COOKIE` / `wikiThemeCookieDomain` |
| First Login wiki card | `getWikiUrl()` | [`FirstLoginSupportStep.jsx`](../../frontend/src/Components/First%20Login/support/FirstLoginSupportStep.jsx) |

## Topic wiring

```text
SPA  ──getWikiUrl──►  https://wiki.{host}/…
SPA  ──eip-theme──►  cookie  ──custom.js──►  Otter Halfmoon
```

`wikiThemeCookieDomain` uses `.example.com` on real hosts. `localhost` / `127.0.0.1` stay host-only (not shared with `wiki.localhost`).
