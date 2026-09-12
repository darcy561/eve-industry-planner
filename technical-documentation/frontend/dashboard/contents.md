# Frontend — dashboard

## Owns (SoT)

Behaviour of the dashboard page's own panels under
[`frontend/src/Components/Dashboard`](../../../frontend/src/Components/Dashboard):
the item watchlist panel, and the dashboard's own tutorial-card row. The
tutorial card component itself is shared with the job planner's side menu and
Edit Job's steps and is documented here as its first caller.

## Does not own

- The price history chart and the price entry dialogue → [../pricing/contents.md](../pricing/contents.md)
- Document-lock UI → [../document-lock/spa.md](../document-lock/spa.md)
- Routing and page chrome → [../navigation/spa.md](../navigation/spa.md)

## Task map

| I need to… | Read |
|------------|------|
| Change what the watchlist tracks, or how it fetches prices | [watchlist.md](./watchlist.md) |
| Change when a tutorial card shows, hides, or how the dashboard's row responds | [tutorial-cards.md](./tutorial-cards.md) |
