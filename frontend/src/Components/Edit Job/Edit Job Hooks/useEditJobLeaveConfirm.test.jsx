import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

const {
  navigated,
  store,
  search,
  persistGate,
  yielded,
  saved,
  handedOver,
  leaveSteps,
  closeOutcome,
} = vi.hoisted(() => ({
  navigated: [],
  store: { current: null },
  search: { current: {} },
  persistGate: { canPersist: true },
  yielded: [],
  saved: [],
  handedOver: [],
  leaveSteps: [],
  closeOutcome: { current: "closed" },
}));

const navigate = (options) => navigated.push(options);

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  useParams: () => ({ jobID: "job-1" }),
  useSearch: () => search.current,
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({}),
  QueryClient: class {},
}));

vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store.current));
});

vi.mock("./useActiveJobDocumentLock", () => ({
  useActiveJobPersistGate: () => persistGate,
}));

vi.mock(
  "../../../Functions/DocumentLock/yieldEditJobDocumentLocksOnLeave.js",
  () => ({
    yieldEditJobDocumentLocksOnLeave: async (args) => {
      yielded.push(args);
    },
  }),
);

vi.mock("../../../Functions/JobPlanner/closeActiveJob", () => ({
  default: async (jobToSave, jobModifiedFlag) => {
    saved.push({ jobID: jobToSave?.jobID, jobModifiedFlag });
    leaveSteps.push("saved");
    return closeOutcome.current;
  },
}));

vi.mock("../../../Events/jobDependencyTreeDialogueEvents", () => ({
  closeJobDependencyTreeDialogue: () => {},
}));

const { useEditJobLeaveConfirm } = await import("./useEditJobLeaveConfirm.js");
const { default: useUsersStore } = await import("../../../Zustand/usersStore");
const { requestEditJobNavigation } =
  await import("../../../Events/editJobNavigationEvents");
const { requestEditJobReleaseConfirmation } =
  await import("../../../Events/editJobReleaseRequestEvents");

function job(jobID, name = "Tritanium") {
  return { jobID, name, itemID: 34 };
}

function seed({
  activeJob = job("job-1"),
  jobModified = false,
  deletedJobIDs = [],
} = {}) {
  restored.length = 0;
  store.current = {
    jobData: {
      actions: {
        setActiveJobID: () => {},
        findJobInJobArray: (id) =>
          deletedJobIDs.includes(id) ? null : job(id, `Job ${id}`),
        updateOrAddJobsToJobArray: (job) => restored.push(job),
      },
    },
    documentLock: {
      actions: {
        handOverEditAccess: async (collection, docID) => {
          handedOver.push({ collection, docID });
          leaveSteps.push("handedOver");
        },
      },
    },
  };

  const { actions } = useUsersStore.getState().editSession;
  actions.closeSession();
  if (activeJob) actions.openJob(activeJob.jobID, activeJob);

  if (jobModified && activeJob) {
    actions.run({
      name: "rename the job",
      recipe: (held) => {
        held.name = `${held.name} (edited)`;
      },
    });
  }

  return { activeJob, jobModified };
}

const restored = [];

function mount() {
  return renderHook(() => useEditJobLeaveConfirm());
}

beforeEach(() => {
  navigated.length = 0;
  yielded.length = 0;
  saved.length = 0;
  handedOver.length = 0;
  leaveSteps.length = 0;
  search.current = {};
  persistGate.canPersist = true;
  closeOutcome.current = "closed";
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("asking to navigate away from an edited job", () => {
  it("leaves the page alone when there is no job open", async () => {
    seed({ activeJob: null });

    mount();

    const outcome = await act(async () =>
      requestEditJobNavigation({ jobID: "job-2" }),
    );

    expect(outcome).toBe("not-handled");
  });

  it("does nothing when asked for the job already open", async () => {
    seed({ activeJob: job("job-1") });

    mount();

    const outcome = await act(async () =>
      requestEditJobNavigation({ jobID: "job-1" }),
    );

    expect(outcome).toBe("cancelled");
  });

  it("goes straight there when nothing has been changed", async () => {
    seed({ jobModified: false });

    mount();

    const outcome = await act(async () =>
      requestEditJobNavigation({ jobID: "job-2" }),
    );

    expect(outcome).toBe("navigated");
    expect(navigated[0]).toMatchObject({ params: { jobID: "job-2" } });
    expect(yielded).toHaveLength(1);
  });

  it("asks first when there are unsaved changes", async () => {
    seed({ jobModified: true });

    const { result } = mount();

    let settled = false;
    await act(async () => {
      requestEditJobNavigation({ jobID: "job-2" }).then(() => {
        settled = true;
      });
    });

    expect(result.current.leaveConfirmDialogueProps.open).toBe(true);
    expect(result.current.leaveConfirmDialogueProps.mode).toBe("navigation");
    expect(navigated).toHaveLength(0);
    expect(settled).toBe(false);
  });

  it("names the job it would move to", async () => {
    seed({ jobModified: true });

    const { result } = mount();

    await act(async () => {
      requestEditJobNavigation({ jobID: "job-2" });
    });

    expect(result.current.leaveConfirmDialogueProps.nextJobName).toBe(
      "Job job-2",
    );
  });

  it("stays put when the prompt is dismissed", async () => {
    seed({ jobModified: true });

    const { result } = mount();
    let outcome;
    await act(async () => {
      requestEditJobNavigation({ jobID: "job-2" }).then((o) => {
        outcome = o;
      });
    });

    await act(async () => result.current.leaveConfirmDialogueProps.onClose());

    expect(outcome).toBe("cancelled");
    expect(result.current.leaveConfirmDialogueProps.open).toBe(false);
  });
});

describe("another session asking for the lock", () => {
  it("leaves it to the slice when there is no job open", async () => {
    seed({ activeJob: null });

    mount();

    const outcome = await act(async () =>
      requestEditJobReleaseConfirmation({ collection: "jobs", docID: "job-1" }),
    );

    expect(outcome).toBe("not-handled");
  });

  it("leaves it to the slice when nothing has been changed", async () => {
    seed({ jobModified: false });

    mount();

    const outcome = await act(async () =>
      requestEditJobReleaseConfirmation({ collection: "jobs", docID: "job-1" }),
    );

    expect(outcome).toBe("not-handled");
  });

  it("asks before handing over unsaved changes", async () => {
    seed({ jobModified: true });

    const { result } = mount();

    await act(async () => {
      requestEditJobReleaseConfirmation({
        collection: "jobs",
        docID: "job-1",
      });
    });

    expect(result.current.leaveConfirmDialogueProps.open).toBe(true);
    expect(result.current.leaveConfirmDialogueProps.mode).toBe(
      "release_request",
    );
  });

  it("does not answer for the reader when the page re-renders", async () => {
    seed({ jobModified: true });
    const { result, rerender } = mount();

    let outcome;
    await act(async () => {
      requestEditJobReleaseConfirmation({
        collection: "jobs",
        docID: "job-1",
      }).then((o) => {
        outcome = o;
      });
    });

    rerender();
    rerender();

    expect(outcome).toBeUndefined();
    expect(result.current.leaveConfirmDialogueProps.open).toBe(true);
  });

  it("cancels what is pending when the page goes", async () => {
    seed({ jobModified: true });

    const { unmount } = mount();
    let outcome;
    await act(async () => {
      requestEditJobReleaseConfirmation({
        collection: "jobs",
        docID: "job-1",
      }).then((o) => {
        outcome = o;
      });
    });

    await act(async () => unmount());

    expect(outcome).toBe("cancelled");
  });

  it("tells the other session to carry on when dismissed", async () => {
    seed({ jobModified: true });

    const { result } = mount();
    let outcome;
    await act(async () => {
      requestEditJobReleaseConfirmation({
        collection: "jobs",
        docID: "job-1",
      }).then((o) => {
        outcome = o;
      });
    });

    await act(async () => result.current.leaveConfirmDialogueProps.onClose());

    expect(outcome).toBe("cancelled");
  });
});

describe("saving from the prompt", () => {
  it("is refused while the job cannot be written", async () => {
    persistGate.canPersist = false;
    seed({ jobModified: true });

    const { result } = mount();
    await act(async () => {
      requestEditJobNavigation({ jobID: "job-2" });
    });

    await act(async () => result.current.leaveConfirmDialogueProps.onSave());

    expect(navigated).toHaveLength(0);
    expect(result.current.leaveConfirmDialogueProps.open).toBe(true);
  });

  it("greys out saving while the job cannot be written", async () => {
    persistGate.canPersist = false;
    seed({ jobModified: true });

    const { result } = mount();

    await act(async () => {
      requestEditJobNavigation({ jobID: "job-2" });
    });

    expect(result.current.leaveConfirmDialogueProps.saveDisabled).toBe(true);
  });

  it("does not put back a job deleted while it was open", async () => {
    seed({ jobModified: true, deletedJobIDs: ["job-1"] });

    const { result } = mount();

    await act(async () => {
      requestEditJobNavigation({ jobID: "job-2" });
    });
    await act(async () => {
      await result.current.leaveConfirmDialogueProps.onDiscard();
    });

    expect(restored).toEqual([]);
  });

  it("puts back a job the store still holds", async () => {
    seed({ jobModified: true });

    const { result } = mount();

    await act(async () => {
      requestEditJobNavigation({ jobID: "job-2" });
    });
    await act(async () => {
      await result.current.leaveConfirmDialogueProps.onDiscard();
    });

    expect(restored.map((job) => job.jobID)).toEqual(["job-1"]);
  });

  it("does not put back a job deleted while the lock was handed over", async () => {
    seed({ jobModified: true, deletedJobIDs: ["job-1"] });

    const { result } = mount();

    await act(async () => {
      requestEditJobReleaseConfirmation({
        collection: "jobs",
        docID: "job-1",
      });
    });
    await act(async () => {
      await result.current.leaveConfirmDialogueProps.onDiscard();
    });

    expect(restored).toEqual([]);
  });

  it("puts back a job the store still holds when handing the lock over", async () => {
    seed({ jobModified: true });

    const { result } = mount();

    await act(async () => {
      requestEditJobReleaseConfirmation({
        collection: "jobs",
        docID: "job-1",
      });
    });
    await act(async () => {
      await result.current.leaveConfirmDialogueProps.onDiscard();
    });

    expect(restored.map((job) => job.jobID)).toEqual(["job-1"]);
  });

  it("saves, hands the lock over and then leaves", async () => {
    search.current = { activeGroup: "group-1" };
    seed({ jobModified: true });

    const { result } = mount();

    let outcome;
    await act(async () => {
      requestEditJobReleaseConfirmation({
        collection: "jobs",
        docID: "job-1",
      }).then((answer) => {
        outcome = answer;
      });
    });
    await act(async () => {
      await result.current.leaveConfirmDialogueProps.onSave();
    });

    expect(saved).toEqual([{ jobID: "job-1", jobModifiedFlag: true }]);
    expect(handedOver).toEqual([{ collection: "jobs", docID: "job-1" }]);
    expect(leaveSteps).toEqual(["saved", "handedOver"]);
    expect(navigated[0]).toMatchObject({ params: { groupID: "group-1" } });
    expect(outcome).toBe("proceed");
  });

  it("centres the group's job tree on the job it handed over", async () => {
    search.current = { activeGroup: "group-1", pageView: "jobTree" };
    seed({ jobModified: true });

    const { result } = mount();

    await act(async () => {
      requestEditJobReleaseConfirmation({
        collection: "jobs",
        docID: "job-1",
      });
    });
    await act(async () => {
      await result.current.leaveConfirmDialogueProps.onDiscard();
    });

    expect(navigated[0]).toMatchObject({
      params: { groupID: "group-1" },
      search: { pageView: "jobTree", focusJobId: "job-1" },
    });
  });

  it("stays and keeps the lock when the save keeps the editor open", async () => {
    seed({ jobModified: true });
    closeOutcome.current = "kept-open";
    const { result } = mount();

    let outcome;
    await act(async () => {
      requestEditJobReleaseConfirmation({
        collection: "jobs",
        docID: "job-1",
      }).then((answer) => {
        outcome = answer;
      });
    });
    await act(async () => {
      await result.current.leaveConfirmDialogueProps.onSave();
    });

    expect(saved).toHaveLength(1);
    expect(handedOver).toEqual([]);
    expect(navigated).toEqual([]);
    expect(outcome).toBe("cancelled");
    expect(result.current.leaveConfirmDialogueProps.open).toBe(false);
  });

  it("stays on the job when the save before moving keeps the editor open", async () => {
    seed({ jobModified: true });
    closeOutcome.current = "kept-open";
    const { result } = mount();

    let outcome;
    await act(async () => {
      requestEditJobNavigation({ jobID: "job-2" }).then((answer) => {
        outcome = answer;
      });
    });
    await act(async () => {
      await result.current.leaveConfirmDialogueProps.onSave();
    });

    expect(saved).toHaveLength(1);
    expect(navigated).toEqual([]);
    expect(yielded).toEqual([]);
    expect(outcome).toBe("cancelled");
    expect(result.current.leaveConfirmDialogueProps.open).toBe(false);
  });
});
