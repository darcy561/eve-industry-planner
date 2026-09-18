import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

import CorporationEsiStatus from "./CorporationEsiStatus";
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
      <CorporationEsiStatus corporationId={98000001} memberHash="hash-1" />
    </QueryClientProvider>,
  );
  return queryClient;
}

function rowFor(name) {
  return screen.getByText(name).closest("div");
}

describe("what is held for a corporation", () => {
  it("names every corporation-wide collection and nothing else", () => {
    renderStatus();

    const shown = COLLECTIONS.filter(
      (collection) => collection.scope !== SCOPE.CHARACTER,
    ).map((collection) => collection.name);

    expect(shown.filter((name) => screen.queryByText(name))).toEqual(shown);
    // Fetched per character, because ESI limits it to what the asking character can see.
    expect(screen.queryByText("Corporation Assets")).not.toBeInTheDocument();
  });

  it("shows a held collection as fresh", () => {
    const queryClient = testQueryClient();
    queryClient.setQueryData(
      ["corporationBlueprints", 98000001],
      ["a blueprint"],
    );

    renderStatus(queryClient);

    expect(
      within(rowFor("Corporation Blueprints")).getByText("fresh"),
    ).toBeVisible();
  });

  it("says a collection nothing has fetched is not held", () => {
    renderStatus();

    expect(
      within(rowFor("Corporation Blueprints")).getByText("not held"),
    ).toBeVisible();
  });

  // A wallet is granted a division at a time, so the collection is only as good as its worst one.
  it("reports a wallet collection as its worst division", () => {
    const queryClient = testQueryClient();
    // Every division but the fourth, which is the one left unreadable.
    for (const division of [1, 2, 3, 5, 6, 7]) {
      queryClient.setQueryData(
        ["corporationJournal", 98000001, division],
        ["an entry"],
      );
    }

    renderStatus(queryClient);

    expect(
      within(rowFor("Corporation Journal")).getByText("not held"),
    ).toBeVisible();
  });
});
