import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { BrandLogo } from "./loadingBrand";

function renderLogoIn(mode) {
  render(
    <ThemeProvider theme={createTheme({ palette: { mode } })}>
      <BrandLogo alt="EVE Industry Planner" />
    </ThemeProvider>,
  );
  return screen.getByRole("img", { name: "EVE Industry Planner" });
}

describe("the app logo follows the theme", () => {
  it("draws black lettering on the light theme", () => {
    expect(renderLogoIn("light")).toHaveAttribute(
      "src",
      "/android-chrome-192x192-black.png",
    );
  });

  it("draws white lettering on the dark theme", () => {
    expect(renderLogoIn("dark")).toHaveAttribute(
      "src",
      "/android-chrome-192x192.png",
    );
  });
});
