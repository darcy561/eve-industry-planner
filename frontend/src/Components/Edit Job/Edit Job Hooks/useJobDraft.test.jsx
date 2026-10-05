import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../Zustand/usersStore", async () => {
  const { create } = await import("zustand");
  const { default: editSessionSlice } =
    await import("../../../Zustand/editSessionSlice.js");
  return { default: create(editSessionSlice) };
});

const { default: useUsersStore } = await import("../../../Zustand/usersStore");
const { useJobDraft, useJobActions, useJobModified } =
  await import("./useJobDraft.js");
const { renderCounts } = await import("../../../tests/renderCounts.jsx");

const session = () => useUsersStore.getState().editSession.actions;

const aJob = () => ({
  jobID: "job-1",
  name: "Rifter",
  build: {
    materials: { 34: { typeID: 34, quantity: 100 } },
    extrasCosts: {},
  },
});

beforeEach(() => {
  session().closeSession();
  session().openJob("job-1", aJob());
});

describe("reading part of the job being edited", () => {
  it("gives the reader what the selector asked for", () => {
    const Name = () => <span>{useJobDraft((job) => job.name)}</span>;

    render(<Name />);

    expect(screen.getByText("Rifter")).toBeInTheDocument();
  });

  it("holds a panel still through a change it reads nothing of", async () => {
    const renders = renderCounts();
    const Materials = renders.watch("materials", () => {
      const materials = useJobDraft((job) => job.build.materials);
      return <span>{Object.keys(materials).length}</span>;
    });

    render(<Materials />);
    renders.reset();

    await act(async () => {
      session().run({
        name: "add extra cost",
        recipe: (job) => {
          job.build.extrasCosts = { "extra-1": { id: "extra-1", cost: 1 } };
        },
      });
    });

    expect(renders.of("materials")).toBe(0);
  });

  it("re-renders on a change to what it does read", async () => {
    const renders = renderCounts();
    const Materials = renders.watch("materials", () => {
      const materials = useJobDraft((job) => job.build.materials);
      return <span>{materials[34].quantity}</span>;
    });

    render(<Materials />);
    renders.reset();

    await act(async () => {
      session().run({
        name: "change a material",
        recipe: (job) => {
          job.build.materials[34].quantity = 250;
        },
      });
    });

    expect(renders.of("materials")).toBe(1);
    expect(screen.getByText("250")).toBeInTheDocument();
  });

  it("follows a document arriving underneath the reader's changes", async () => {
    const Name = () => <span>{useJobDraft((job) => job.name)}</span>;
    render(<Name />);

    await act(async () => {
      session().documentArrived("job-1", { ...aJob(), name: "Punisher" });
    });

    expect(screen.getByText("Punisher")).toBeInTheDocument();
  });

  it("asks the selector nothing while no job is open", () => {
    const selector = vi.fn((job) => job.name);
    const Name = () => <span>{useJobDraft(selector) ?? "nothing open"}</span>;

    act(() => {
      session().closeSession();
    });
    render(<Name />);

    expect(selector).not.toHaveBeenCalled();
    expect(screen.getByText("nothing open")).toBeInTheDocument();
  });

  it("hands back the same actions across an edit", async () => {
    const seen = [];
    const Panel = () => {
      seen.push(useJobActions());
      return null;
    };

    render(<Panel />);
    await act(async () => {
      session().run({
        name: "rename",
        recipe: (job) => {
          job.name = "Punisher";
        },
      });
    });

    expect(seen).toHaveLength(1);
    expect(useUsersStore.getState().editSession.actions).toBe(seen[0]);
  });

  it("refuses a selector that builds its answer", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const Materials = () => {
      const rows = useJobDraft((job) => Object.values(job.build.materials));
      return <span>{rows.length}</span>;
    };

    expect(() => render(<Materials />)).toThrow(/builds a new value/);
  });
});

describe("whether the editor holds the reader's changes", () => {
  const Modified = () => <span>{String(useJobModified())}</span>;

  it("still says so once a copy arriving under them sets them aside", async () => {
    render(<Modified />);
    await act(async () => {
      session().run({
        name: "rename",
        recipe: (job) => {
          job.name = "mine";
        },
      });
      session().documentArrived("job-1", { ...aJob(), name: "theirs" });
    });

    expect(useUsersStore.getState().editSession.draft.log).toEqual([]);
    expect(screen.getByText("true")).toBeInTheDocument();
  });
});
