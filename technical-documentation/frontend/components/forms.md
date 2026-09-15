# Labelled fields (`Styled Components/Textfield`)

Live SoT for the app-shell design's labelled-control shells.

`FormField`
([`Styled Components/Textfield/FormField.jsx`](../../../frontend/src/Styled%20Components/Textfield/FormField.jsx))
is a labelled control: a `FigureCaption` title (see [figures.md](./figures.md)), an optional
description, and the control beneath them — so a panel names a control and a figure the one way. Title
and description each render only when given, rather than leaving an empty line for a caller passing
neither.

`SwitchField`
([`Styled Components/Textfield/SwitchField.jsx`](../../../frontend/src/Styled%20Components/Textfield/SwitchField.jsx))
is a setting that is on or off, named on the left with the switch on the right. It hands its caller the
new checked state directly rather than the change event.
