# App-shell components — tests

Live SoT for test depth across the shared app-shell atoms under `Styled Components`. Behaviour →
[frontend/components/contents.md](../../frontend/components/contents.md). Module entrypoints →
[contents.md](./contents.md).

## Entrypoints

| Check | Where | Notes |
|-------|--------|--------|
| Whole suite | From `frontend/`: `npm test -- --run` | Vitest; no browser, no stack |
| One atom | `npx vitest run "src/Styled Components/Paper/EntityRow.test.jsx"` | Same pattern for any atom under `Styled Components` |
| Coverage | `npm run coverage` | `vitest run --coverage` |

Tests sit beside the component they cover.

## Coverage map

**Depth:** Most of the library carries its own tests, and they are written against what a reader
sees rather than against the props that produced it. What is thin is the newest surface: the panel
shell every page's sections are drawn on, and a setting shell with no call site of its own.

### Tested

| Area | What the tests cover |
|------|----------------------|
| `Paper/EntityRow.jsx` | Pieces placed where the page's other lists put them; a row with nothing but a name; the selected row marked; a long name held to one line |
| `Menu/ActionMenu.jsx` | Actions offered under a button naming what they act on; a disabled action's reason shown; each menu instance carrying its own ids; nothing drawn when there is nothing to offer |
| `Paper/SectionPanel.jsx` | Titles and holds a section's content, the way every other app-shell panel titles itself; drawn without a subtitle; several children spaced from each other and from the subtitle; a throwing child caught rather than taking the page down, reported under the section's own title or a name the caller gives instead; a control carried opposite the title |
| `Paper/SelectableCard.jsx` | The whole card as the control, and its hit area; the chosen state; reachable and operable from the keyboard; a disabled card refusing the choice; one of a set against an independent choice; the input inside hidden from assistive technology |
| `Paper/ActionCard.jsx` | A card that navigates, saying it leaves the app, against one that acts; keyboard reach; no role announced when it does neither, so it is not a dead control; a link preferred when given both; an unconfigured card dimmed while a card that still acts never is; the icon bookend and its absence |
| `Paper/InsetSurface.jsx` | The content it is given; the recessed surface; a caller's `sx` taking precedence |
| `Textfield/FormField.jsx` | A control labelled and explained; a control given neither a title nor a description wrapped without either line; a title taken without a description |
| `Typography/figures.jsx` | Each piece the module defines, one block of assertions apiece: `Figure` and a raw number given to one, `SignedPercent`, `FigureRow` and the shapes a breakdown is made of, `FigureCaption`, `BandCaption`, `ContextRow`, `HeadlineStat`, `PanelHeadline`, `PanelFooterMeta`, `StatTile`, `Disclosure`, `figureToneColour` and `totalRowSx` |
| `Chip/statusChip.jsx` | The status it was given; each tone coloured distinctly, so a panel names a state rather than a colour; no weight carried when no tone is given |
| `Avatar/EveImageAvatar.jsx` | The subject it names, and EVE's own default portrait and logo; a url something else resolved; asking at twice the drawn size, and at the largest a responsive picture reaches; the name a reader who cannot see it gets; the variant, and the circle it defaults to; a caller's own stand-in passed through |
| `Shared/eveImage.js` | A size the server actually serves, never below what is drawn; an item named by type and variation, and each variation as the image server knows it; a character's portrait and a corporation's logo; no url at all rather than one the server cannot serve |
| `Avatar/MarketGroupIcon.jsx` | The item a group borrows its picture from; nothing asked for when it has nothing to borrow; a size the image server publishes |

### Little / none

- `Textfield/SwitchField.jsx` carries no test of its own. Its one call site — first login's
  citadel-names step — clicks the switch it renders and asserts the change reaches the store, so the
  shell's wiring is exercised, but nothing covers the shell itself. See
  [frontend/components/forms.md](../../frontend/components/forms.md).
- `EveImageAvatar`'s alliance subject and `eveImage.js`'s `allianceImageUrl` have no assertion of
  their own among the avatar tests above; they are reached only through
  `PlannersPanel.test.jsx` — see [accounts.md](./accounts.md) § Tested — asserting a planner "wears
  the owner's own artwork".
- `Paper/AppShellPanel.jsx` carries no test of its own, and it is the surface every app-shell
  section is drawn on. What covers it is whatever a page's own tests happen to assert about the
  panel around them.
