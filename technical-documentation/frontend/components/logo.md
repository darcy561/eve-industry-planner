# The app logo (`Components/loadingBrand.jsx`, `frontend/index.html`)

Live SoT for how the SPA draws its own "Ei" logo, in the page and in the browser tab.

## Two colourings of one mark

Every logo file in [`frontend/public`](../../../frontend/public) comes in two colourings of the same
artwork: the original white lettering on a transparent background, and a `-black` copy whose pixels
keep the original's alpha with the colour set to black. The black copy is derived from the white one,
so a change to the mark is made to the white files and the black ones are regenerated from them. The
repository holds no font or source file for the mark, only these rendered images.

## In the page

`BrandLogo` is the only way a screen shows the logo. It picks the black file on the light theme and
the white file on the dark one, reading `theme.palette.mode`, so it follows the reader's own theme
choice. The loading splash, the maintenance screen and the first-login welcome banner draw it; a
caller passes `alt` when the logo is the only thing naming the app and its size through `sx`.

## In the browser tab

`index.html` lists every `rel="icon"` link twice, the white file under
`media="(prefers-color-scheme: dark)"` and the black one under `(prefers-color-scheme: light)`. That
follows the browser's colour scheme, not the app's theme, so the tab and the page can disagree when a
reader has picked a theme different from their system's. A browser that ignores `media` on icon links
picks among both sets by size alone.

The `apple-touch-icon` stays white only: iOS draws it on its own background and does not read `media`
on that link.
