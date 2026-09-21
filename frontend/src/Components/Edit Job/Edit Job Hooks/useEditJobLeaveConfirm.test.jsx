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
} = vi.hoisted(() => ({
  navigated: [],
  store: { current: null },
  search: { current: {} },
  persistGate: { canPersist: true },
  yielded: [],
  saved: [],
  handedOver: [],
  // One log for both, because the order of the two is the thing worth
  // pinning: two arrays say each happened, not which happened first.
  leaveSteps: [],
}));

// Stable, as the router's own is: a fresh function each render would re-run the
// effects that register the handlers, and their cleanup cancels what is pending.
const navigate = (options) => navigated.push(options);

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  useParams: () => ({ jobID: "job-1" }),
  useSearch: () => search.current,
}));

// `QueryClient` as well as the hook: the leave paths reach `Job`, and the
// module chain behind it builds the app's own client at import time.
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
    return true;
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

/**
 * @param {object} [opts]
 * @param {string[]} [opts.deletedJobIDs] - jobs the store no longer holds, as a
 *   job deleted by another member while this reader had it open
 */
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

  // Leaving reads the job from the session, which is where the editor holds it,
  // so a test expecting one put back has to have opened it.
  const { actions } = useUsersStore.getState().editSession;
  actions.closeSession();
  if (activeJob) actions.openJob(activeJob.jobID, activeJob);

  // Unsaved changes are a real change to the draft, because that is what the
  // hook asks: a flag handed in would say the job had been edited while the
  // layers under it said it had not.
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

/** Jobs put back into the array by a discard. */
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

  // The registration is deliberately made once and never again: its cleanup
  // cancels whatever is pending. Were it to re-run while a prompt was up, it
  // would answer the other session on the reader's behalf and leave the
  // dialogue open with nothing behind it.
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

  // Discarding restores the copy taken when editing began — unless the job went
  // while the reader had it open, when putting it back would show them what they
  // have just been told is gone.
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

  // Handing the lock over discards the same way navigating away does, so it
  // needs the same refusal: a job that went while this reader held it must not
  // be put back for the session taking over.
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

  // The whole of the save-and-hand-over path, which is the one a reader takes
  // when another session asks for a job they have unsaved work on: the job is
  // written first, the lock goes to the session waiting for it, and only then
  // does the holder leave the page. In that order, because a hand-over that
  // went first would let the other session read the job as it was before the
  // save.
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

  // Handing the lock over sends the holder back where they came from, and a
  // reader who was looking at the group's job tree is sent back to it centred
  // on the job they have just let go of. The id has to be the route's own: by
  // the time this navigates, the save or the discard has ended the session, so
  // a job read out of it then is no job at all.
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
});
