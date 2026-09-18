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
    expect(screen.getByText("Characters")).toBeInTheDocument();
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

  // The layout renders a page as a flex item in a row. A page that does not claim the row shrinks
  // to its widest section and sits against the left edge with the rest of the window empty —
  // which is what happened here once the sections stopped being full-width grids.
  it("claims the width of the layout row it sits in", () => {
    const { container } = render(
      <QueryClientProvider client={testQueryClient()}>
        <AccountsPage />
      </QueryClientProvider>,
    );

    const page = getComputedStyle(container.firstChild);

    expect(page.flexGrow).toBe("1");
    expect(page.width).toBe("100%");
  });
});
