import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreOverSession } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreOverSession();
});

const { default: useUsersStore } = await import("../../../Zustand/usersStore");
const { usersStoreState } = await import("../../../tests/usersStoreHarness.js");
const { documentLockKey } =
  await import("../../../Functions/DocumentLock/documentLockKey.js");
const {
  useActiveGroupReadOnly,
  useActiveJobLockHeld,
  useActiveJobPersistGate,
  useActiveJobReadOnly,
  useSiblingLinkLock,
} = await import("./useActiveJobDocumentLock.js");

const JOBS = "job_documents";
const GROUPS = "job_groups";

const session = () => useUsersStore.getState().editSession;

const openJob = ({ groupID, includedInGroup } = {}) =>
  session().actions.openJob("job-1", {
    jobID: "job-1",
    name: "Rifter",
    groupID,
    includedInGroup,
    build: {},
  });

const lockedAs = (held = {}, jobData = {}, account = {}) => {
  useUsersStore.setState(
    usersStoreState({
      account,
      documentLock: { scopes: held },
      jobData: {
        ...jobData,
        actions: {
          getGroupObject: (id) => (jobData.groups ?? []).find((g) => g === id),
        },
      },
    }),
  );
};

const scope = (collection, docID, state) => ({
  [documentLockKey(collection, docID)]: state,
});

const answer = (useHook, read = (value) => String(value)) => {
  const Reader = () => <span>{read(useHook())}</span>;
  const { container, unmount } = render(<Reader />);
  const text = container.textContent;
  unmount();
  return text;
};

beforeEach(() => {
  session().actions.closeSession();
  lockedAs();
});

describe("the locks on the job being edited", () => {
  it("says a job nobody has opened is not read-only", () => {
    expect(answer(useActiveJobReadOnly)).toBe("false");
    expect(answer(useActiveJobLockHeld)).toBe("false");
  });

  it("reports the job read-only when another session holds it", () => {
    openJob();
    lockedAs(scope(JOBS, "job-1", { readOnly: true }));

    expect(answer(useActiveJobReadOnly)).toBe("true");
  });

  it("reads the lock of the job that is open, not another one", () => {
    openJob();
    lockedAs(scope(JOBS, "job-2", { readOnly: true }));

    expect(answer(useActiveJobReadOnly)).toBe("false");
  });

  it("says this tab holds the lock when it does", () => {
    openJob();
    lockedAs(scope(JOBS, "job-1", { lockHeld: true }));

    expect(answer(useActiveJobLockHeld)).toBe("true");
  });

  it("ignores a group lock for a job that is not in one", () => {
    openJob();
    lockedAs(scope(GROUPS, "group-1", { readOnly: true }));

    expect(answer(useActiveGroupReadOnly)).toBe("false");
  });

  it("reports the group read-only for a job included in that group", () => {
    openJob({ groupID: "group-1", includedInGroup: true });
    lockedAs(scope(GROUPS, "group-1", { readOnly: true }), {
      groups: ["group-1"],
    });

    expect(answer(useActiveGroupReadOnly)).toBe("true");
  });

  it("answers to the job's own lock while the group is the one being worked in", () => {
    openJob({ groupID: "group-1", includedInGroup: true });
    lockedAs(scope(GROUPS, "group-1", { readOnly: true }), {
      groups: ["group-1"],
      activeGroupID: "group-1",
    });

    expect(answer(useActiveJobReadOnly)).toBe("false");
  });

  it("saves a grouped job on its own lock, whoever holds the group", () => {
    openJob({ groupID: "group-1", includedInGroup: true });
    lockedAs(
      {
        ...scope(JOBS, "job-1", { lockHeld: true }),
        ...scope(GROUPS, "group-1", { readOnly: true }),
      },
      { groups: ["group-1"], activeGroupID: "group-1" },
      { isLoggedIn: true },
    );

    expect(
      answer(useActiveJobPersistGate, (gate) => String(gate.canPersist)),
    ).toBe("true");
  });

  it("refuses to persist a job another session is holding", () => {
    openJob();
    lockedAs(
      scope(JOBS, "job-1", { readOnly: true }),
      {},
      { isLoggedIn: true },
    );

    expect(
      answer(useActiveJobPersistGate, (gate) => String(gate.canPersist)),
    ).toBe("false");
  });

  it("lets a guest edit a job the server says is held", () => {
    openJob();
    lockedAs(scope(JOBS, "job-1", { readOnly: true }));

    expect(
      answer(useActiveJobPersistGate, (gate) => String(gate.canPersist)),
    ).toBe("true");
  });

  it("says why a sibling link cannot change", () => {
    openJob();
    lockedAs(
      scope(JOBS, "job-1", { readOnly: true }),
      {},
      { isLoggedIn: true },
    );

    const reason = answer(useSiblingLinkLock, (lock) =>
      [lock.readOnly, lock.reason].join("|"),
    );
    expect(reason).toMatch(/^true\|.+/);
  });
});
