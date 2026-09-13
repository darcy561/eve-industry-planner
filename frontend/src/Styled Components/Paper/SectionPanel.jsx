import { Stack, Typography } from "@mui/material";

import AppShellPanel from "./AppShellPanel";

/**
 * A titled section of a page, with an optional line explaining it.
 *
 * `AppShellPanel` gives a panel its surface and title; this adds the two things
 * a section of a settings or onboarding screen needs on top — a subtitle, and
 * spacing between the several children such a section is passed. The panel's own
 * content box does not space them.
 *
 * @param {object} props
 * @param {React.ReactNode} props.title
 * @param {React.ReactNode} [props.subtitle]
 * @param {React.ReactNode} props.children
 * @param {string} [props.componentName] - error boundary label; the title names it otherwise
 */
export function SectionPanel({ title, subtitle, children, componentName }) {
  return (
    // No fallback of its own: the panel already names an unlabelled section after
    // its title, and a constant here would report every section under one name.
    <AppShellPanel title={title} componentName={componentName}>
      <Stack spacing={1.5}>
        {subtitle ? (
          <Typography variant="body2" color="text.secondary">
            {subtitle}
          </Typography>
        ) : null}
        {children}
      </Stack>
    </AppShellPanel>
  );
}
