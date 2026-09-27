import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import GlobalStyles from "@mui/material/GlobalStyles";
import { ThemeProvider, createTheme } from "@mui/material/styles";

import { viewTransitionStyles } from "./viewTransitionStyles";

const theme = createTheme();
const animated = "::view-transition-old(*), ::view-transition-new(*)";
const reducedMotion = "@media (prefers-reduced-motion: reduce)";

describe("view transition styles", () => {
  it("times a transition by the same figures MUI's own transitions use", () => {
    expect(viewTransitionStyles(theme)[animated]).toEqual({
      animationDuration: `${theme.transitions.duration.enteringScreen}ms`,
      animationTimingFunction: theme.transitions.easing.easeInOut,
    });
  });

  it("follows a theme that states its own timing", () => {
    const slower = createTheme({
      transitions: { duration: { enteringScreen: 640 } },
    });

    expect(viewTransitionStyles(slower)[animated].animationDuration).toBe(
      "640ms",
    );
  });

  it("animates nothing for a reader who asked for reduced motion", () => {
    const reduced = viewTransitionStyles(theme)[reducedMotion];

    expect(
      reduced[
        "::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*)"
      ],
    ).toEqual({ animation: "none" });
  });

  it("reaches the document as rules a browser can read", () => {
    render(
      <ThemeProvider theme={theme}>
        <GlobalStyles styles={viewTransitionStyles} />
      </ThemeProvider>,
    );

    const emitted = [...document.querySelectorAll("style")]
      .map((element) => element.textContent)
      .join("\n");

    expect(emitted).toContain("::view-transition-old(*)");
    expect(emitted).toMatch(
      new RegExp(
        `animation-duration:\\s*${theme.transitions.duration.enteringScreen}ms`,
      ),
    );
    expect(emitted).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^}]*\{[^}]*animation:\s*none/,
    );
  });
});
