import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";

import { FirstLoginAccountsStep } from "./FirstLoginAccountsStep";
import { testQueryClient } from "../../../tests/queryClients.js";

const toggleShareCitadelNames = vi.fn();
const scheduleSave = vi.fn();

let shareCitadelNames = false;

vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreMock(() =>
    usersStoreState({
      account: {
        shareCitadelNames,
        characters: [
          {
            CharacterID: 2114794365,
            CharacterName: "Oswold Saraki",
            CharacterHash: "main",
            isMainCharacter: true,
          },
        ],
        actions: {
          toggleShareCitadelNames,
          getMainCharacterName: () => "Oswold Saraki",
          getMainCharacterHash: () => "main",
          getCorporation: () => null,
        },
      },
    }),
  );
});

vi.mock("../../../Functions/Debounce/userDocumentsPersistSchedule.js", () => ({
  scheduleDebouncedUserAccountDocumentSave: (...args) => scheduleSave(...args),
  flushPendingUserDocumentSaves: vi.fn(async () => {}),
}));

function renderStep() {
  return render(
    <QueryClientProvider client={testQueryClient()}>
      <FirstLoginAccountsStep />
    </QueryClientProvider>,
  );
}

describe("the accounts step of first login", () => {
  beforeEach(() => {
    shareCitadelNames = false;
    toggleShareCitadelNames.mockClear();
    scheduleSave.mockClear();
  });

  it("introduces the character being signed in as", () => {
    renderStep();

    expect(screen.getByText("Your main character")).toBeInTheDocument();
    expect(screen.getByText("Oswold Saraki")).toBeInTheDocument();
  });

  it("does not offer the account id a reader has no use for yet", () => {
    renderStep();

    expect(screen.queryByText("Account ID")).not.toBeInTheDocument();
  });

  it("offers linking further characters as its own section", () => {
    renderStep();

    expect(screen.getByText("Linked characters")).toBeInTheDocument();
  });

  it("asks about sharing citadel names, and saves the answer", async () => {
    const user = userEvent.setup();
    renderStep();

    await user.click(screen.getByRole("switch"));

    expect(toggleShareCitadelNames).toHaveBeenCalledTimes(1);
    expect(scheduleSave).toHaveBeenCalledTimes(1);
  });

  // The choice governs the characters linked on this very step, so it cannot wait until the reader
  // finds the Accounts page afterwards: an account that linked characters under the default would
  // have to add them again to change it.
  it("lets a reader choose where linked character tokens are kept", () => {
    renderStep();

    expect(screen.getByRole("button", { name: "Cloud" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "This browser" }),
    ).toBeInTheDocument();
  });
});
