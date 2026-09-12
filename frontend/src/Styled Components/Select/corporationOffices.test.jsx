import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { store } = vi.hoisted(() => ({
  store: {
    account: { characters: [], corporations: [] },
  },
}));

vi.mock("../../Zustand/usersStore", () => ({
  default: Object.assign((selector) => selector(store), {
    getState: () => store,
  }),
}));

// An id with no name seeded into the cache stands for one still being asked about, unless it is in
// `failing` — a lookup that did not settle, which throws and is never cached.
vi.mock("../../Functions/EveESI/World/nameLoader", () => ({
  requestName: (id) => {
    if (failing.has(id)) return Promise.reject(new Error(`no reaching ${id}`));
    return new Promise(() => {});
  },
}));

import CorporationOfficesSelect from "./corporationOffices";
import seedLocationNames from "../../tests/seedLocationNames";

const CORPORATION = 98000001;
const JITA = 60003760;
const RAITARU = 1035466617946;
const SOTIYO = 1035466617947;

/** Offices whose lookup does not settle, rather than staying in flight. */
let failing = new Set();

/** The offices already named when a test renders; an id left out is one still being asked about. */
let names = {};

function open(props = {}) {
  const user = userEvent.setup();
  // nameQuery asks for its own retries, and a per-query option outlives a client default — so the
  // wait between attempts is collapsed rather than the attempts removed.
  const client = new QueryClient({
    defaultOptions: { queries: { retryDelay: 0 } },
  });
  seedLocationNames(client, names);
  render(
    <QueryClientProvider client={client}>
      <CorporationOfficesSelect
        selectedCorporation={CORPORATION}
        value=""
        onChange={() => {}}
        {...props}
      />
    </QueryClientProvider>,
  );
  return user;
}

beforeEach(() => {
  store.account = {
    characters: [],
    corporations: [
      { corporation_id: CORPORATION, officeLocations: [RAITARU, JITA, SOTIYO] },
    ],
  };
  failing = new Set();
  names = {
    [JITA]: "Jita IV-4",
    // Deliberately sorts after "No Access…" alphabetically: without the unreadable-last rule
    // this office would come out between the two readable ones.
    [RAITARU]: "Zoohen Raitaru",
    [SOTIYO]: {
      name: `No Access To Location - ${SOTIYO}`,
      resolutionStatus: "no_access",
    },
  };
});

describe("the offices a corporation picker offers", () => {
  // An office no character can dock at is still an office the corporation holds. Left out, it reads
  // as one the corporation does not have; shown, the reader can see what the app could not name.
  it("offers an office nobody can read, saying so, after the named ones", async () => {
    const user = open();

    await user.click(screen.getByRole("combobox"));

    const offices = within(screen.getByRole("listbox"))
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(offices).toEqual([
      "Select an office",
      "Jita IV-4",
      "Zoohen Raitaru",
      `No Access To Location - ${SOTIYO}`,
    ]);
  });

  it("lets an office nobody can read be chosen", async () => {
    const chosen = vi.fn();
    const user = open({ onChange: chosen });

    await user.click(screen.getByRole("combobox"));
    await user.click(
      screen.getByRole("option", { name: `No Access To Location - ${SOTIYO}` }),
    );

    expect(chosen).toHaveBeenCalledWith(SOTIYO);
  });

  it("shows the chosen office rather than an empty box", () => {
    open({ value: JITA });

    expect(screen.getByRole("combobox").textContent).toBe("Jita IV-4");
  });

  // The office is the corporation's whether or not the app could name it, and a chosen one dropping
  // out of the list would clear the reader's choice without saying why.
  it("offers an office whose name could not be resolved, saying so", async () => {
    store.account.characters = [{ CharacterHash: "hash-a" }];
    delete names[RAITARU];
    failing.add(RAITARU);

    const user = open();
    await user.click(screen.getByRole("combobox"));

    const offices = within(screen.getByRole("listbox"))
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(offices).toContain("Name unavailable");
  });

  it("keeps the chosen office selected when its name could not be resolved", async () => {
    store.account.characters = [{ CharacterHash: "hash-a" }];
    delete names[RAITARU];
    failing.add(RAITARU);

    open({ value: RAITARU });

    await vi.waitFor(() =>
      expect(screen.getByRole("combobox").textContent).toBe("Name unavailable"),
    );
  });

  // MUI warns and renders an empty box for a value with no item behind it, which is what a chosen
  // office whose name has not arrived yet would be.
  it("holds no value while the chosen office is still being named", () => {
    delete names[JITA];

    open({ value: JITA });

    expect(screen.getByRole("combobox").textContent).toBe("Select an office");
  });
});
