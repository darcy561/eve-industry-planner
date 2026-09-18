import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

import CharacterEsiStatus from "./CharacterEsiStatus";
import { testQueryClient } from "../../tests/queryClients.js";
import {
  COLLECTIONS,
  SCOPE,
} from "../../Functions/EveESI/prefetch/collections.js";

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() =>
    usersStoreState({
      account: {
        characters: [],
        corporations: [{ corporation_id: 98000001, members: ["hash-1"] }],
        actions: { findCharacterByHash: () => null },
      },
    }),
  );
});

vi.mock("../../Functions/Auth/esiCredentials/provider.js", () => ({
  heldEsiAccessToken: () => "",
}));

function renderStatus(queryClient = testQueryClient()) {
  render(
    <QueryClientProvider client={queryClient}>
      <CharacterEsiStatus characterHash="hash-1" />
    </QueryClientProvider>,
  );
  return queryClient;
}

function rowFor(name) {
  return screen.getByText(name).closest("div");
}

describe("what is held for a character", () => {
  // The list is the collection table, not a copy of it written beside the page.
  it("names every collection fetched for a character", () => {
    renderStatus();

    const shown = COLLECTIONS.filter(
      (collection) => collection.scope === SCOPE.CHARACTER,
    ).map((collection) => collection.name);

    expect(shown.filter((name) => screen.queryByText(name))).toEqual(shown);
  });

  // These come back whole to any member holding the role, so showing them per character would show
  // one corporation's data once per member of it.
  it("leaves the corporation-wide collections to the corporation", () => {
    renderStatus();

    expect(
      screen.queryByText("Corporation Blueprints"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Corporation Assets")).toBeInTheDocument();
  });

  it("shows how long ago a held collection arrived", () => {
    const queryClient = testQueryClient();
    queryClient.setQueryData(["characterSkills", "hash-1"], ["a skill"]);

    renderStatus(queryClient);

    expect(within(rowFor("Character Skills")).getByText("fresh")).toBeVisible();
  });

  it("says a collection nothing has fetched is not held", () => {
    renderStatus();

    expect(
      within(rowFor("Character Skills")).getByText("not held"),
    ).toBeVisible();
  });

  // Absence is correct for a collection that is never prefetched, and a reader must not read it as
  // a fault.
  it("says an on-demand collection is fetched when it is opened", () => {
    renderStatus();

    expect(
      within(rowFor("Character Assets")).getByText("on demand"),
    ).toBeVisible();
  });

  it("says plainly that the ages only cover this session", () => {
    renderStatus();

    expect(screen.getByText(/this browsing session only/i)).toBeVisible();
  });
});
