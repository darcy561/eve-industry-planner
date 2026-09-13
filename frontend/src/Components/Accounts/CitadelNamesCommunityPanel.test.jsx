import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CitadelNamesCommunityPanel } from "./CitadelNamesCommunityPanel";

const toggleShareCitadelNames = vi.fn();
const scheduleSave = vi.fn();

let shareCitadelNames = false;

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() =>
    usersStoreState({
      account: {
        shareCitadelNames,
        actions: { toggleShareCitadelNames },
      },
    }),
  );
});

vi.mock("../../Functions/Debounce/userDocumentsPersistSchedule.js", () => ({
  scheduleDebouncedUserAccountDocumentSave: (...args) => scheduleSave(...args),
}));

describe("sharing citadel names with the community", () => {
  beforeEach(() => {
    shareCitadelNames = false;
    toggleShareCitadelNames.mockClear();
    scheduleSave.mockClear();
  });

  it("shows whether the reader is sharing", () => {
    shareCitadelNames = true;
    render(<CitadelNamesCommunityPanel />);

    expect(screen.getByRole("switch")).toBeChecked();
  });

  it("turns sharing on, and saves the choice", async () => {
    const user = userEvent.setup();
    render(<CitadelNamesCommunityPanel />);

    await user.click(screen.getByRole("switch"));

    expect(toggleShareCitadelNames).toHaveBeenCalledTimes(1);
    // A setting the reader changed and the application forgot is worse than one
    // it never offered.
    expect(scheduleSave).toHaveBeenCalledTimes(1);
  });

  it("explains what sharing means", () => {
    render(<CitadelNamesCommunityPanel />);

    expect(screen.getByText(/stored anonymously/)).toBeInTheDocument();
  });
});
