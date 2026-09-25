import { beforeEach, describe, expect, it, vi } from "vitest";
import { PricedSurface } from "../../../../../../tests/pricedSurface.jsx";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const useGetCharacterSkills = vi.fn();
const resolveSellerCharacter = vi.fn();
const resolveSaleLocation = vi.fn();

vi.mock(
  "../../../../../../Hooks/EveEsi/Character/useGetCharacterSkills",
  () => ({
    useGetCharacterSkills: (...args) => useGetCharacterSkills(...args),
  }),
);

vi.mock("../../../../../../Functions/MarketOrders/sellerCharacter", () => ({
  resolveSellerCharacter: (...args) => resolveSellerCharacter(...args),
}));

const useSellingRates = vi.fn(() => ({ data: undefined, isLoading: false }));

vi.mock(
  "../../../../../../Hooks/React Query/Character/useSellingRates",
  () => ({
    useSellingRates: (...args) => useSellingRates(...args),
  }),
);

vi.mock("../../../../../../Functions/MarketData/prices/marketPriceForType.js", () => ({
  getPriceRefreshedAt: () => undefined,
  getMarketPriceForType: () => 10_000,
}));

vi.mock(
  "../../../../../../Functions/MarketOrders/saleLocations",
  async (original) => {
    const actual = await original();
    return {
      ...actual,
      getDefaultSaleStructure: () => ({ id: "citadel" }),
      resolveSaleLocation: (...args) => resolveSaleLocation(...args),
    };
  },
);

/** The characters this account holds, which decides whose levels are quoted. */
const reader = { own: ["builder"], main: "my-main" };

vi.mock("../../../../../../Zustand/usersStore", async () => {
  const { usersStoreOverSession } =
    await import("../../../../../../tests/usersStoreHarness.js");
  return usersStoreOverSession({
    account: {
      actions: {
        findCharacterByHash: (hash) =>
          reader.own.includes(hash)
            ? {
                CharacterName: hash === "builder" ? "Builder Pilot" : "My Main",
              }
            : null,
        getMainCharacterHash: () => reader.main,
      },
    },
    jobData: { actions: { findJobInJobArray: (id) => jobsInStore[id] } },
    applicationSettings: { actions: { getCurrentLocale: () => "en-GB" } },
  });
});

const jobsInStore = {};

const { SkillsPanel } = await import("./SkillsPanel");
const { default: useUsersStore } =
  await import("../../../../../../Zustand/usersStore");
const { SALE_LOCATION_KIND } =
  await import("../../../../../../Functions/MarketOrders/saleLocations");
const { industrySkillIDs, jobTypes, marketSkillIDs } =
  await import("../../../../../../Context/defaultValues");

const session = () => useUsersStore.getState().editSession;

/** The job as the planner stores one: ten items, and two skills on it. */
const jobDocument = ({ setup = {}, build = {}, ...rest } = {}) => ({
  jobID: "job-1",
  itemID: 34,
  name: "Tritanium",
  jobType: jobTypes.manufacturing,
  itemsProducedPerRun: 10,
  parentJobs: [],
  skills: {
    [industrySkillIDs.industry]: {
      typeID: industrySkillIDs.industry,
      level: 4,
    },
    3395: { typeID: 3395, level: 3 },
  },
  layout: { setupToEdit: "setup0" },
  build: {
    materials: {},
    childJobs: {},
    extrasCosts: {},
    inventionEntries: {},
    sellerCharacter: null,
    saleLocationID: null,
    setup: {
      setup0: {
        id: "setup0",
        selectedCharacter: "builder",
        jobType: jobTypes.manufacturing,
        rawTime: 10000,
        runCount: 1,
        jobCount: 1,
        TE: 0,
        structureID: 0,
        rigID: 0,
        materialCount: {},
        ...setup,
      },
    },
    ...build,
  },
  esi: { industryJobs: {}, marketOrders: {}, transactions: {} },
  ...rest,
});

const show = (document = jobDocument()) => {
  session().actions.openJob(document.jobID, document);
  return render(
    <PricedSurface>
      <SkillsPanel />
    </PricedSurface>,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  session().actions.closeSession();
  reader.own = ["builder"];
  useSellingRates.mockReturnValue({ data: undefined, isLoading: false });
  resolveSellerCharacter.mockReturnValue({
    hash: "trader",
    name: "Market Alt",
    isDefault: false,
  });
  resolveSaleLocation.mockReturnValue({
    kind: SALE_LOCATION_KIND.NPC_STATION,
    name: "Jita",
  });
  useGetCharacterSkills.mockReturnValue({
    data: {
      [industrySkillIDs.industry]: { activeLevel: 5 },
      3395: { activeLevel: 2 },
      [marketSkillIDs.brokerRelations]: { activeLevel: 4 },
      [marketSkillIDs.accounting]: { activeLevel: 5 },
    },
    isLoading: false,
    isError: false,
  });
});

describe("the Skills panel", () => {
  it("answers all three questions, not only what is required", () => {
    show();

    expect(screen.getByText(/Required to build/)).toBeInTheDocument();
    expect(screen.getByText("Shortens the job")).toBeInTheDocument();
    expect(screen.getByText("Affects what selling costs")).toBeInTheDocument();
  });

  it("marks a requirement the character falls short of", () => {
    show();

    expect(screen.getByText("5 / 4")).toBeInTheDocument();
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
  });

  // The builder runs the job and the seller lists the order; they are routinely
  // different characters, so each group says whose levels it is quoting.
  it("names the character each group is quoted for", () => {
    show();

    expect(screen.getAllByText("Builder Pilot").length).toBeGreaterThan(0);
    expect(screen.getByText("Market Alt")).toBeInTheDocument();
  });

  it("reads the selling skills from the seller, not the builder", () => {
    show();

    expect(useGetCharacterSkills).toHaveBeenCalledWith("builder");
    expect(useGetCharacterSkills).toHaveBeenCalledWith("trader");
  });

  // On a shared planner the setup names the member who planned it, and this
  // account holds no skills for them: quoting that character would fill the
  // panel with levels nobody has.
  it("quotes the reader's main when the setup names another member", () => {
    reader.own = [];

    show();

    expect(useGetCharacterSkills).toHaveBeenCalledWith("my-main");
    expect(useGetCharacterSkills).not.toHaveBeenCalledWith("builder");
  });

  // A skill vanishing from a panel reads as a defect rather than as an answer.
  it("keeps Broker Relations at a citadel, saying it does not apply", () => {
    resolveSaleLocation.mockReturnValue({
      kind: SALE_LOCATION_KIND.CITADEL,
      name: "A Citadel",
    });

    show();

    expect(screen.getByText("Broker Relations")).toBeInTheDocument();
    expect(screen.getByText(/not applied here/)).toBeInTheDocument();
  });

  // The panel was signed-in only, and crashed outright without a character. The
  // requirement is readable without an account; the levels are not claimed.
  it("states the requirement when signed out", () => {
    useGetCharacterSkills.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    });
    resolveSellerCharacter.mockReturnValue({
      hash: null,
      name: null,
      isDefault: true,
    });

    show(jobDocument({ setup: { selectedCharacter: null } }));

    expect(screen.getByText("needs 4")).toBeInTheDocument();
    expect(screen.getByText("needs 3")).toBeInTheDocument();
  });

  it("draws nothing without a setup to read", () => {
    const { container } = show(jobDocument({ layout: { setupToEdit: null } }));

    expect(container).toBeEmptyDOMElement();
  });

  it("takes its own height rather than its parent's", () => {
    const { container } = show();

    expect(container.querySelector(".MuiPaper-root")).not.toHaveStyle({
      height: "100%",
    });
  });
});

// A job whose output is owed to its parents never lists anything, so what
// selling would cost is not a question it has — Returns drops for the same
// reason, and the two panels must agree.
describe("a job with nothing to sell", () => {
  it("drops the selling group entirely", () => {
    jobsInStore["parent"] = {
      build: {
        materials: { [String(34)]: { typeID: 34, quantity: 10 } },
        childJobs: { 34: ["job-1"] },
      },
    };

    show(jobDocument({ parentJobs: ["parent"] }));

    expect(
      screen.queryByText("Affects what selling costs"),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Required to build/)).toBeInTheDocument();
  });

  it("keeps it where the job makes more than its parents need", () => {
    jobsInStore["parent"] = {
      build: {
        materials: { [String(34)]: { typeID: 34, quantity: 4 } },
        childJobs: { 34: ["job-1"] },
      },
    };

    show(jobDocument({ parentJobs: ["parent"] }));

    expect(screen.getByText("Affects what selling costs")).toBeInTheDocument();
  });
});

// The what-if is only reachable through the panel, so the panel is where its
// wiring has to be proven — a prop passed wrongly here is invisible to the
// control's own tests, which build their props by hand.
describe("the what-if it carries", () => {
  const rates = {
    brokerFee: {
      kind: SALE_LOCATION_KIND.NPC_STATION,
      base: 3,
      rate: 2.4,
      terms: [
        { id: "brokerRelations", amount: 0.6, level: 2 },
        { id: "faction", amount: 0, level: 0 },
        { id: "corporation", amount: 0, level: 0 },
      ],
    },
    salesTax: { base: 7.5, accounting: 0, rate: 7.5 },
  };

  it("offers the what-if once the rates are known", () => {
    useSellingRates.mockReturnValue({ data: rates, isLoading: false });

    show();

    expect(screen.getByText("What selling costs")).toBeInTheDocument();
  });

  it("prices it against what this job would actually list", () => {
    useSellingRates.mockReturnValue({ data: rates, isLoading: false });

    show();

    // 10,000 a unit across the 10 produced is a 100,000 listing: 2.4% fee and
    // 7.5% tax come to 9,900.
    expect(screen.getByText("9,900.00")).toBeInTheDocument();
  });

  it("offers nothing to try until the rates arrive", () => {
    show();

    expect(screen.queryByText("What selling costs")).not.toBeInTheDocument();
  });

  it("offers nothing to try on a job with nothing to sell", () => {
    useSellingRates.mockReturnValue({ data: rates, isLoading: false });
    jobsInStore["parent"] = {
      build: {
        materials: { [String(34)]: { typeID: 34, quantity: 10 } },
        childJobs: { 34: ["job-1"] },
      },
    };

    show(jobDocument({ parentJobs: ["parent"] }));

    expect(screen.queryByText("What selling costs")).not.toBeInTheDocument();
  });
});

// A red row saying "2 / 4" leaves the reader to work out the consequence. The
// count and the shortfall are what turn it into an answer.
describe("what a shortfall blocks", () => {
  it("counts how much of the requirement is met", () => {
    show();

    expect(
      screen.getByText("Required to build — 1 of 2 met"),
    ).toBeInTheDocument();
  });

  it("says the job cannot start, and what is short by how much", () => {
    show();

    expect(screen.getByText("Job cannot start")).toBeInTheDocument();
    expect(screen.getByText(/needs 1 more level/)).toBeInTheDocument();
  });

  it("says the job can be run once nothing is short", () => {
    useGetCharacterSkills.mockReturnValue({
      data: {
        [industrySkillIDs.industry]: { activeLevel: 5 },
        3395: { activeLevel: 5 },
      },
      isLoading: false,
      isError: false,
    });

    show();

    expect(screen.getByText("Job can be run")).toBeInTheDocument();
  });
});

// Raising a level is a question, not a plan — so the panel says plainly that the
// figures on screen are hypothetical, and offers the way back.
describe("trying a level", () => {
  it("marks the panel as a what-if once a level is raised", async () => {
    show();

    await userEvent.click(screen.getAllByLabelText("Industry at level 3")[0]);

    expect(screen.getByText("What-if")).toBeInTheDocument();
    expect(screen.getByText("Reset")).toBeInTheDocument();
  });

  it("states the move rather than replacing the real level", async () => {
    show();

    await userEvent.click(screen.getAllByLabelText("Industry at level 3")[0]);

    // Industry is in two groups, and a level tried is tried in both.
    expect(screen.getAllByText("5 → 3").length).toBeGreaterThan(0);
  });

  // Raising the blocked skill answers the question the row poses.
  it("re-counts the requirement at the level being tried", async () => {
    show();

    await userEvent.click(
      screen.getAllByLabelText(
        "Advanced Small Ship Construction at level 3",
      )[0],
    );

    expect(
      screen.getByText("Required to build — 2 of 2 met"),
    ).toBeInTheDocument();
    expect(screen.getByText("Job can be run")).toBeInTheDocument();
  });

  it("puts the question back", async () => {
    show();

    await userEvent.click(screen.getAllByLabelText("Industry at level 3")[0]);
    await userEvent.click(screen.getByText("Reset"));

    expect(screen.queryByText("What-if")).not.toBeInTheDocument();
  });
});

// Industry skills move the job's time and no ISK figure, so without this they
// were the only rows on the panel that could be tried and produce no answer.
describe("what a level does to the job's time", () => {
  it("states how long the job takes", () => {
    show();

    expect(screen.getByText("How long it takes")).toBeInTheDocument();
    expect(screen.getByText("Job time")).toBeInTheDocument();
  });

  it("re-derives the time at the level being tried", async () => {
    show();
    const before = screen.getByText("Job time").closest("div").textContent;

    await userEvent.click(
      screen.getAllByLabelText(
        "Advanced Small Ship Construction at level 5",
      )[0],
    );

    expect(screen.getByText("Job time").closest("div").textContent).not.toBe(
      before,
    );
  });

  it("says how much shorter or longer it would be", async () => {
    show();

    await userEvent.click(
      screen.getAllByLabelText(
        "Advanced Small Ship Construction at level 5",
      )[0],
    );

    expect(screen.getByText(/shorter/)).toBeInTheDocument();
  });
});

// A control that changes the panel's shape on its own first use moves itself
// out from under the pointer, so what the header and the effect blocks occupy
// must not depend on whether anything is being tried.
describe("its shape while a level is being tried", () => {
  const rowCountOf = (container) =>
    container.querySelectorAll("[data-fill]").length;

  it("keeps the header's action slot whether or not anything is proposed", () => {
    const { container } = show();

    // The slot exists before the chip does.
    expect(screen.queryByText("What-if")).not.toBeInTheDocument();
    expect(rowCountOf(container)).toBeGreaterThan(0);
  });

  it("says something on the time line before a level is tried", () => {
    show();

    expect(screen.getByText("at your current levels")).toBeInTheDocument();
  });

  it("keeps the same number of lines once a level is tried", async () => {
    const { container } = show();
    const before = container.querySelectorAll("p, span").length;

    await userEvent.click(screen.getAllByLabelText("Industry at level 3")[0]);

    // The chip and the Reset link are the only additions; nothing else on the
    // panel gains or loses a line.
    const after = container.querySelectorAll("p, span").length;
    expect(after - before).toBeLessThanOrEqual(4);
  });
});

// Skills quotes a broker fee and a sales tax, and Returns quotes them again from
// its own hook. Both have to resolve the same seller and the same location from
// the job's plan, or the panel telling a player what Accounting is worth is
// answering for a character who is not selling this job's output.
describe("whose rates it is quoting", () => {
  it("reads the seller and the sale location the job names", () => {
    show(
      jobDocument({
        build: { sellerCharacter: "job-seller", saleLocationID: "job-citadel" },
      }),
    );

    expect(resolveSellerCharacter).toHaveBeenCalledWith("job-seller");
    expect(resolveSaleLocation).toHaveBeenCalledWith(
      "job-citadel",
      expect.anything(),
    );
  });

  it("falls back to the account default when the job names neither", () => {
    show();

    expect(resolveSellerCharacter).toHaveBeenCalledWith(null);
    expect(resolveSaleLocation).toHaveBeenCalledWith(
      "citadel",
      expect.anything(),
    );
  });
});
