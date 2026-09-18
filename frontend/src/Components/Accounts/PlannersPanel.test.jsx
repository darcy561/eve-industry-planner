import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

let planners = [];
let queryState = { isLoading: false, isError: false };
let activeOwner = "account:acc-1";

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() =>
    usersStoreState({
      account: {
        characters: [
          {
            CharacterID: 2114794365,
            CharacterName: "Oswold Saraki",
            isMainCharacter: true,
          },
        ],
      },
      activePlanner: { owner: activeOwner },
    }),
  );
});

vi.mock("../../Hooks/React Query/planners", () => ({
  usePlannersQuery: () => ({ data: planners, ...queryState }),
  plannerDisplayName: (planner) =>
    planner.name || (planner.kind === "account" ? "My planner" : "Corporation"),
}));

const { PlannersPanel } = await import("./PlannersPanel.jsx");

const OWN = {
  owner: "account:acc-1",
  kind: "account",
  name: "",
  named: true,
  joinMethod: "owner",
};
const CORPORATION = {
  owner: "corporation:98000001",
  kind: "corporation",
  name: "Hard Knocks Inc.",
  named: true,
  joinMethod: "entityMember",
};
const ALLIANCE = {
  owner: "alliance:99005338",
  kind: "alliance",
  name: "Pandemic Horde",
  named: false,
  joinMethod: "invite",
};

const CUSTOM = {
  owner: "planner:9c1f-…-a20",
  kind: "planner",
  name: "Cane fleet crew",
  named: true,
  joinMethod: "accessList",
};

const OWN_CUSTOM = {
  owner: "planner:01J9-…-7f2",
  kind: "planner",
  name: "Hurricane run",
  named: true,
  joinMethod: "owner",
};

function renderPanel() {
  render(<PlannersPanel />);
}

describe("the planners an account can work in", () => {
  beforeEach(() => {
    planners = [OWN, CORPORATION, ALLIANCE];
    queryState = { isLoading: false, isError: false };
    activeOwner = "account:acc-1";
  });

  it("lists each planner with why the account is in it", () => {
    renderPanel();

    expect(screen.getByText("My planner")).toBeInTheDocument();
    expect(screen.getByText("owner")).toBeInTheDocument();
    expect(screen.getByText("Hard Knocks Inc.")).toBeInTheDocument();
    expect(screen.getByText("member")).toBeInTheDocument();
    expect(screen.getByText("Pandemic Horde")).toBeInTheDocument();
    expect(screen.getByText("invited")).toBeInTheDocument();
  });

  it("marks the one being worked in", () => {
    activeOwner = "corporation:98000001";
    renderPanel();

    expect(screen.getByText("active")).toBeInTheDocument();
  });

  // Whether a planner document exists yet is the server's business: working in one creates it, so
  // a reader has nothing to do about it and the row says only what kind of planner it is.
  it("does not distinguish a planner nothing has opened yet", () => {
    renderPanel();

    expect(screen.getAllByText("corporation")).toHaveLength(1);
    expect(screen.getByText("alliance")).toBeInTheDocument();
    expect(screen.queryByText(/not opened yet/)).not.toBeInTheDocument();
  });

  it("wears the owner's own artwork", () => {
    renderPanel();

    const sources = [
      screen.getByAltText("Hard Knocks Inc. logo"),
      screen.getByAltText("Pandemic Horde logo"),
      screen.getByAltText("Oswold Saraki portrait"),
    ].map((img) => img.getAttribute("src") ?? "");

    expect(sources.some((src) => src.includes("corporations/98000001"))).toBe(
      true,
    );
    expect(sources.some((src) => src.includes("alliances/99005338"))).toBe(
      true,
    );
    expect(sources.some((src) => src.includes("characters/2114794365"))).toBe(
      true,
    );
  });

  // Drawn and inert on purpose: a disabled control that does not say why is indistinguishable from
  // a broken one.
  it("offers a custom planner's actions, saying what each waits for", async () => {
    const user = userEvent.setup();
    planners = [CUSTOM];
    renderPanel();

    await user.click(
      screen.getByRole("button", { name: /cane fleet crew actions/i }),
    );

    // Each says what it waits for, and they do not wait on the same thing: inviting needs an API,
    // leaving needs the revocation path that drops the planner's access.
    expect(screen.getByText(/waiting on an invite api/i)).toBeInTheDocument();
    expect(
      screen.getByText(/drops a planner's access when a member leaves/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /see members/i }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  // Access to a corporation or alliance planner follows the group, derived from the session's
  // grants: there is nobody to invite, no roster to read, and no leaving short of leaving the corp.
  it("manages nothing on a planner whose access follows the group", () => {
    planners = [CORPORATION, ALLIANCE];
    renderPanel();

    expect(
      screen.queryByRole("button", { name: /hard knocks inc\. actions/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /pandemic horde actions/i }),
    ).not.toBeInTheDocument();
    // The rows are still rows — only the menu is absent.
    expect(screen.getByText("Hard Knocks Inc.")).toBeInTheDocument();
  });

  it("manages nothing on the account's own planner", () => {
    planners = [OWN];
    renderPanel();

    expect(
      screen.queryByRole("button", { name: /my planner actions/i }),
    ).not.toBeInTheDocument();
  });

  it("draws nothing while the listing is still loading", () => {
    queryState = { isLoading: true, isError: false };
    renderPanel();

    expect(screen.queryByText("Planners")).not.toBeInTheDocument();
  });

  it("draws nothing when the listing cannot be had", () => {
    queryState = { isLoading: false, isError: true };
    renderPanel();

    expect(screen.queryByText("Planners")).not.toBeInTheDocument();
  });

  // A custom planner belongs to no EVE entity. Falling through to the account's own artwork would
  // put the reader's own face on somebody else's planner.
  it("wears nothing for a planner with no entity behind it", () => {
    planners = [CUSTOM];
    renderPanel();

    expect(screen.getByText("Cane fleet crew")).toBeInTheDocument();
    expect(screen.getByText("access list")).toBeInTheDocument();
    expect(
      screen.queryByAltText("Oswold Saraki portrait"),
    ).not.toBeInTheDocument();
  });

  // A custom planner you made: there are people to invite and a roster to read, but leaving your
  // own planner is not a thing.
  it("offers everything but leaving on a custom planner the account owns", async () => {
    const user = userEvent.setup();
    planners = [OWN_CUSTOM];
    renderPanel();

    await user.click(
      screen.getByRole("button", { name: /hurricane run actions/i }),
    );

    expect(
      screen.getByRole("menuitem", { name: /invite a character/i }),
    ).toBeVisible();
    expect(
      screen.getByRole("menuitem", { name: /see members/i }),
    ).toBeVisible();
    expect(
      screen.queryByRole("menuitem", { name: /leave planner/i }),
    ).not.toBeInTheDocument();
  });
});
