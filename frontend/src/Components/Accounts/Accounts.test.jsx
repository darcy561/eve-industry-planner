import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

import AccountsPage from "./Accounts";
import { testQueryClient } from "../../tests/queryClients.js";

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() =>
    usersStoreState({
      account: {
        shareCitadelNames: false,
        characters: [
          {
            CharacterID: 2114794365,
            CharacterName: "Oswold Saraki",
            CharacterHash: "main",
            isMainCharacter: true,
          },
        ],
        actions: {
          getAccountID: () => "acc-1",
          getMainCharacterName: () => "Oswold Saraki",
          getMainCharacterHash: () => "main",
          getCorporation: () => null,
          toggleShareCitadelNames: vi.fn(),
        },
      },
    }),
  );
});

vi.mock("../../Functions/Debounce/userDocumentsPersistSchedule.js", () => ({
  scheduleDebouncedUserAccountDocumentSave: vi.fn(),
  flushPendingUserDocumentSaves: vi.fn(async () => {}),
}));

describe("the accounts page", () => {
  it("carries each of its sections", () => {
    render(
      <QueryClientProvider client={testQueryClient()}>
        <AccountsPage />
      </QueryClientProvider>,
    );

    expect(screen.getByText("Account")).toBeInTheDocument();
    expect(screen.getByText("Linked characters")).toBeInTheDocument();
    expect(screen.getByText("Community citadel names")).toBeInTheDocument();
  });

  it("shows the account id here, where first login does not", () => {
    render(
      <QueryClientProvider client={testQueryClient()}>
        <AccountsPage />
      </QueryClientProvider>,
    );

    expect(screen.getByText("Account ID")).toBeInTheDocument();
    expect(screen.getByText("acc-1")).toBeInTheDocument();
  });
});
