import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, createTheme } from "@mui/material/styles";

vi.mock("./structureForm", () => ({
  default: ({ selectedJobType }) => (
    <div>describing a structure of kind {selectedJobType}</div>
  ),
}));

vi.mock("./currentStructures", () => ({
  default: ({ selectedJobType }) => (
    <div>the structures saved for kind {selectedJobType}</div>
  ),
}));

const { default: CustomStructuresForm } =
  await import("./CustomStructuresForm.jsx");
const { jobTypes } = await import("../../../../Context/defaultValues");

const show = () =>
  render(
    <ThemeProvider theme={createTheme()}>
      <CustomStructuresForm />
    </ThemeProvider>,
  );

describe("the custom structures settings frame", () => {
  it("asks which kind is being saved before anything else", () => {
    show();

    expect(
      screen.getByRole("radio", { name: /Manufacturing/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/describing a structure/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/the structures saved/i)).not.toBeInTheDocument();
  });

  it("shows the form and the saved list once a kind is chosen", async () => {
    show();

    await userEvent.click(
      screen.getByRole("radio", { name: /Manufacturing/i }),
    );

    expect(
      screen.getByText(
        `describing a structure of kind ${jobTypes.manufacturing}`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        `the structures saved for kind ${jobTypes.manufacturing}`,
      ),
    ).toBeInTheDocument();
  });

  it("hands both the kind chosen most recently", async () => {
    show();

    await userEvent.click(
      screen.getByRole("radio", { name: /Manufacturing/i }),
    );
    await userEvent.click(screen.getByRole("radio", { name: /Reprocessing/i }));

    expect(
      screen.getByText(
        `describing a structure of kind ${jobTypes.reprocessing}`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        `describing a structure of kind ${jobTypes.manufacturing}`,
      ),
    ).not.toBeInTheDocument();
  });
});
