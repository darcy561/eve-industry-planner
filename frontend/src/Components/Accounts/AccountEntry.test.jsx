import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";

import { AccountEntry } from "./AccountEntry";
import { testQueryClient } from "../../tests/queryClients.js";
import {
  CREDENTIAL_HEALTH,
  recordCredentialHealth,
  resetCredentialHealth,
} from "../../Functions/Auth/esiCredentials/health.js";
import {
  EsiCredentialError,
  ESI_CREDENTIAL_REAUTH_REQUIRED,
} from "../../Functions/Auth/esiCredentials/errors.js";

const removeCharacter = vi.fn();
const removeCharacterFromCorporations = vi.fn();
const deleteCloudStoredEsiRefreshTokens = vi.fn(async () => true);
const updateLocalRefreshTokens = vi.fn();
const reacquireEsiAccessToken = vi.fn(async () => ({}));

let corporation = null;
let cloudAccounts = false;

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() =>
    usersStoreState({
      account: {
        characters: [],
        actions: {
          removeCharacter,
          removeCharacterFromCorporations,
          getCorporation: () => corporation,
        },
      },
      applicationSettings: { userCloudAccounts: cloudAccounts },
    }),
  );
});

vi.mock(
  "../../Functions/Endpoints/Private/cloudStoredEsiRefreshTokens.js",
  () => ({
    deleteCloudStoredEsiRefreshTokens: (...args) =>
      deleteCloudStoredEsiRefreshTokens(...args),
  }),
);

vi.mock("../../Functions/Auth/buildAccountData.js", () => ({
  updateLocalRefreshTokens: (...args) => updateLocalRefreshTokens(...args),
}));

vi.mock("../../Functions/Debounce/userDocumentsPersistSchedule.js", () => ({
  scheduleDebouncedUserAccountDocumentSave: vi.fn(),
}));

vi.mock("../../Functions/Auth/refreshAccountSessionGrants.js", () => ({
  default: vi.fn(async () => {}),
}));

vi.mock("../../Functions/Auth/esiCredentials/provider.js", () => ({
  reacquireEsiAccessToken: (...args) => reacquireEsiAccessToken(...args),
  heldEsiAccessToken: () => "",
}));

function aCharacter(overrides = {}) {
  return {
    CharacterID: 2114794365,
    CharacterName: "Oswold Saraki",
    CharacterHash: "hash-1",
    corporation_id: 98000001,
    ...overrides,
  };
}

function renderEntry(
  character = aCharacter(),
  queryClient = testQueryClient(),
) {
  render(
    <QueryClientProvider client={queryClient}>
      <AccountEntry character={character} />
    </QueryClientProvider>,
  );
  return queryClient;
}

async function openActions(user) {
  await user.click(
    screen.getByRole("button", { name: "Oswold Saraki actions" }),
  );
}

describe("a linked character", () => {
  beforeEach(() => {
    corporation = {
      corporation_id: 98000001,
      corporationName: "Hard Knocks Inc.",
    };
    cloudAccounts = false;
    removeCharacter.mockClear();
    removeCharacterFromCorporations.mockClear();
    deleteCloudStoredEsiRefreshTokens.mockClear();
    updateLocalRefreshTokens.mockClear();
    reacquireEsiAccessToken.mockClear();
    reacquireEsiAccessToken.mockResolvedValue({});
    resetCredentialHealth();
  });

  it("is named, with the corporation it belongs to", () => {
    renderEntry();

    expect(screen.getByText("Oswold Saraki")).toBeInTheDocument();
    expect(screen.getByText("Hard Knocks Inc.")).toBeInTheDocument();
  });

  it("shows the character's own portrait", () => {
    renderEntry();

    const portrait = screen.getByAltText("Oswold Saraki portrait");
    expect(portrait).toHaveAttribute(
      "src",
      expect.stringContaining("2114794365"),
    );
  });

  it("says so when the corporation is not known", () => {
    corporation = null;
    renderEntry();

    expect(screen.getByText("No corporation")).toBeInTheDocument();
  });

  it("removes the character from the account", async () => {
    const user = userEvent.setup();
    renderEntry();

    await openActions(user);
    await user.click(
      screen.getByRole("menuitem", { name: /remove character/i }),
    );

    await waitFor(() => {
      expect(removeCharacter).toHaveBeenCalled();
    });
    // The corporation list is keyed by character, so a removed character has to
    // leave it too or the account keeps a corporation nothing reaches.
    expect(removeCharacterFromCorporations).toHaveBeenCalledWith("hash-1");
  });

  it("clears the stored token from the browser when kept locally", async () => {
    const user = userEvent.setup();
    renderEntry();

    await openActions(user);
    await user.click(
      screen.getByRole("menuitem", { name: /remove character/i }),
    );

    await waitFor(() => {
      expect(updateLocalRefreshTokens).toHaveBeenCalled();
    });
    expect(deleteCloudStoredEsiRefreshTokens).not.toHaveBeenCalled();
  });

  it("clears the stored token from the server when kept in the cloud", async () => {
    const user = userEvent.setup();
    cloudAccounts = true;
    renderEntry();

    await openActions(user);
    await user.click(
      screen.getByRole("menuitem", { name: /remove character/i }),
    );

    await waitFor(() => {
      expect(deleteCloudStoredEsiRefreshTokens).toHaveBeenCalledWith([
        "hash-1",
      ]);
    });
    expect(updateLocalRefreshTokens).not.toHaveBeenCalled();
  });

  it("says nothing about credentials nothing has been asked of", () => {
    renderEntry();

    expect(screen.queryByText(/esi connected/i)).not.toBeInTheDocument();
  });

  // Nothing acquires a token on a schedule, so a failure seen once stands until something asks
  // again. Undated it reads as a broken token rather than as an old observation.
  it("says how long ago a passing failure was seen", () => {
    recordCredentialHealth(
      "hash-1",
      CREDENTIAL_HEALTH.DEGRADED,
      Date.now() - (3 * 60 * 60 * 1000 + 60_000),
    );
    renderEntry();

    expect(screen.getByText(/ESI unavailable · 3 hours ago/)).toBeVisible();
  });

  // Renewing asks for a token with the same spent secret, so a character past renewing is offered
  // the sign-in that replaces it instead.
  it("offers linking again rather than renewing once the secret is spent", async () => {
    const user = userEvent.setup();
    recordCredentialHealth("hash-1", CREDENTIAL_HEALTH.REAUTH_REQUIRED);
    renderEntry();

    await openActions(user);

    expect(
      screen.getByRole("menuitem", { name: /link character again/i }),
    ).toBeVisible();
    expect(
      screen.queryByRole("menuitem", { name: /renew esi access/i }),
    ).not.toBeInTheDocument();
  });

  it("offers renewing while the secret may still work", async () => {
    const user = userEvent.setup();
    recordCredentialHealth("hash-1", CREDENTIAL_HEALTH.DEGRADED);
    renderEntry();

    await openActions(user);

    expect(
      screen.getByRole("menuitem", { name: /renew esi access/i }),
    ).toBeVisible();
    expect(
      screen.queryByRole("menuitem", { name: /link character again/i }),
    ).not.toBeInTheDocument();
  });

  // A spent refresh secret cannot recover however long ago it was seen, so an age would only
  // suggest waiting is worth trying.
  it("does not date a state that cannot recover", () => {
    recordCredentialHealth(
      "hash-1",
      CREDENTIAL_HEALTH.REAUTH_REQUIRED,
      Date.now() - 3 * 60 * 60 * 1000,
    );
    renderEntry();

    expect(screen.getByText("Needs re-authorising")).toBeVisible();
  });

  it("marks a character whose credentials are spent", () => {
    recordCredentialHealth("hash-1", CREDENTIAL_HEALTH.REAUTH_REQUIRED);
    renderEntry();

    expect(screen.getByText("Needs re-authorising")).toBeInTheDocument();
  });

  it("marks a character the application can reach ESI as", () => {
    recordCredentialHealth("hash-1", CREDENTIAL_HEALTH.OK);
    renderEntry();

    expect(screen.getByText("ESI connected")).toBeInTheDocument();
  });

  it("renews the character's ESI access on request", async () => {
    const user = userEvent.setup();
    renderEntry();

    await openActions(user);
    await user.click(screen.getByRole("menuitem", { name: /renew esi/i }));

    await waitFor(() => {
      expect(reacquireEsiAccessToken).toHaveBeenCalledWith("hash-1");
    });
  });

  it("survives a renewal the credentials cannot serve", async () => {
    const user = userEvent.setup();
    reacquireEsiAccessToken.mockRejectedValue(
      new EsiCredentialError("gone", ESI_CREDENTIAL_REAUTH_REQUIRED),
    );
    renderEntry();

    await openActions(user);
    await user.click(screen.getByRole("menuitem", { name: /renew esi/i }));

    await waitFor(() => {
      expect(reacquireEsiAccessToken).toHaveBeenCalled();
    });
    expect(screen.getByText("Oswold Saraki")).toBeInTheDocument();
  });

  it("clears what is held for this character and leaves the rest", async () => {
    const user = userEvent.setup();
    const queryClient = testQueryClient();
    queryClient.setQueryData(["characterSkills", "hash-1"], ["mine"]);
    queryClient.setQueryData(["characterSkills", "hash-2"], ["theirs"]);
    renderEntry(aCharacter(), queryClient);

    await openActions(user);
    await user.click(screen.getByRole("menuitem", { name: /clear esi data/i }));

    await waitFor(() => {
      expect(
        queryClient.getQueryData(["characterSkills", "hash-1"]),
      ).toBeUndefined();
    });
    expect(queryClient.getQueryData(["characterSkills", "hash-2"])).toEqual([
      "theirs",
    ]);
  });

  // Removing a character is occasional and destructive, which is what the row menu is for.
  it("offers removal in the row menu, and nowhere else", async () => {
    const user = userEvent.setup();
    renderEntry();

    expect(
      screen.queryByRole("button", { name: /remove oswold saraki/i }),
    ).not.toBeInTheDocument();

    await openActions(user);

    expect(
      screen.getByRole("menuitem", { name: /remove character/i }),
    ).toBeVisible();
  });

  // The account signs in as its main character; unlinking it is not something this row can offer.
  it("does not offer to remove the main character", async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={testQueryClient()}>
        <AccountEntry character={aCharacter()} isMain />
      </QueryClientProvider>,
    );

    expect(screen.getByText("main")).toBeInTheDocument();

    await openActions(user);

    expect(
      screen.queryByRole("menuitem", { name: /remove character/i }),
    ).not.toBeInTheDocument();
  });

  // A closed disclosure that computes anyway is the cost this rule exists to avoid: a
  // per-collection status for every character on the roster is real work.
  it("holds the ESI status list back until it is opened", async () => {
    const user = userEvent.setup();
    renderEntry();

    expect(screen.queryByText("Character Skills")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /esi data/i }));

    expect(screen.getByText("Character Skills")).toBeInTheDocument();
  });
});
