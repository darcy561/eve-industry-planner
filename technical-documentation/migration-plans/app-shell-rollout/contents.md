# App shell rollout

## Owns

Converting the screens that predate the app-shell design, or that drew their own
version of it, onto the shared surface and the component layer above it.

- The **panel surface**, wherever a screen re-implements it rather than using
  `AppShellPanel` or the `appShell` sx helpers.
- The **component layer** in `Styled Components` — the figure, chip, card and
  surface atoms panels compose rather than restyle — and what still needs adding
  to it as more screens convert.
- Which screens have converted, which have not, and what each one is still
  carrying of its own.

## Does not own

- **The app-shell design itself.** What the surface looks like is settled; this
  project moves screens onto it and does not redesign it.
- **Panels being built new.** [planning-stage-panels](../planning-stage-panels/contents.md)
  builds the Planning stage's four panels on the shell directly, and adds to the
  component layer as it needs pieces. This project follows behind it rather than
  competing with it.
- **Behaviour.** A conversion changes what a screen is made of, not what it does.
  Where a conversion finds a defect, it is recorded here and fixed separately.
- **The Accounts page** → [accounts-page/contents.md](../accounts-page/contents.md).
  That screen is being redesigned rather than converted, and a redesign converts it
  on the way. It takes `AdditionalAccounts`, `AccountEntry` and
  `FirstLoginMainCharacterCard` with it, along with retiring the `appearance` fork
  those share with the Settings custom-structure components.

## Task map

| I need to… | Read |
|------------|------|
| See what has converted and what has not | [plan.md](./plan.md) § Screens |
| Know what the component layer already offers | [plan.md](./plan.md) § The component layer |
| Understand why a screen drawing its own surface is a problem | [plan.md](./plan.md) § Why this matters |
| See what a conversion has to preserve | [plan.md](./plan.md) § How a screen converts |
