import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const capture = JSON.parse(
  readFileSync(
    resolve(
      process.cwd(),
      "../testing/fixtures/realtime-messages/job-conflict-capture.json",
    ),
    "utf8",
  ),
);

const answers = [];
const sent = [];

vi.mock(
  "../../Functions/Endpoints/Private/applyPrivateHeaders.js",
  async (importOriginal) => ({
    ...(await importOriginal()),
    requestWithPrivateHeaders: async (url, options) => {
      sent.push({ method: options.method, body: JSON.parse(options.body) });
      const answer = answers.shift();
      if (!answer) throw new Error(`no answer recorded for ${options.method}`);
      return new Response(
        answer.body === undefined ? null : JSON.stringify(answer.body),
        { status: answer.status },
      );
    },
  }),
);

vi.mock("./Edit Job Hooks/useSaveAndLeave", async () => {
  const { saveOpenJob } = await import("./Edit Job Hooks/saveOpenJob");
  return { useSaveAndLeave: () => () => saveOpenJob(null) };
});

const { default: useUsersStore } = await import("../../Zustand/usersStore");
const { applyDocumentMessage } =
  await import("../../WebSocket/handlers/documentMessage.js");
const { jobFromDocument, toDocument } =
  await import("../../Functions/JobDocuments/jobDocument.js");
const { saveOpenJob } = await import("./Edit Job Hooks/saveOpenJob");
const { USER_JOBS_COLLECTION } =
  await import("../../Functions/DocumentLock/documentLockCollections.js");
const { default: ChangeReviewDialogue } =
  await import("./ChangeReviewDialogue.jsx");
const { default: IncomingSaveNotice } =
  await import("./IncomingSaveNotice.jsx");

const { jobID } = capture;
const framesFor = (tab) =>
  capture.frames[tab].filter((frame) => frame.docID === jobID);
const owner = framesFor("editor")[0].owner;
const editorsName = capture.sent.kept.jobs[0].document.name;
const incomingName = capture.afterIncoming.name;

function tabHolding(document) {
  const state = useUsersStore.getState();
  state.jobData.actions.resetJobDataStore();
  state.websocketSync.actions.reset();
  state.editSession.actions.closeSession();
  useUsersStore.setState((current) => ({
    account: { ...current.account, accountID: "acct-1", isLoggedIn: true },
    applicationSettings: {
      ...current.applicationSettings,
      enableAutomaticJobRecalculation: false,
    },
  }));
  useUsersStore.getState().activePlanner.actions.setActivePlannerOwner(owner);
  useUsersStore
    .getState()
    .jobData.actions.updateOrAddJobsToJobArray([jobFromDocument(document)]);
}

function editorTab() {
  tabHolding(capture.before);
  const { editSession, documentLock } = useUsersStore.getState();
  documentLock.actions.patchDocumentLockForScope(USER_JOBS_COLLECTION, jobID, {
    readOnly: false,
    lockHeld: true,
  });
  editSession.actions.openJob(
    jobID,
    toDocument(jobFromDocument(capture.before)),
  );
  editSession.actions.run({
    name: "Rename",
    recipe: (job) => {
      job.name = editorsName;
    },
  });
}

async function deliver(frames) {
  vi.useFakeTimers();
  for (const frame of frames) {
    await applyDocumentMessage(frame);
  }
  await vi.advanceTimersByTimeAsync(200);
  vi.useRealTimers();
}

function heldJob() {
  return toDocument(
    useUsersStore
      .getState()
      .jobData.jobArray.find((job) => job.jobID === jobID),
  );
}

function draft() {
  return useUsersStore.getState().editSession.draft.drafts[jobID];
}

function sentChange(index) {
  const { jobs, oneChange } = sent[index].body;
  return {
    oneChange,
    jobs: jobs.map(({ jobID: id, revision, document }) => ({
      jobID: id,
      revision,
      document,
    })),
  };
}

beforeEach(() => {
  answers.length = 0;
  sent.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("the tab editing the job, whose delivery of the incoming save went missing", () => {
  it("is refused whole, reviews the incoming save, keeps its own value and saves again", async () => {
    editorTab();
    render(
      <>
        <IncomingSaveNotice />
        <ChangeReviewDialogue />
      </>,
    );
    answers.push(capture.answered.stale, capture.answered.reread, {
      status: capture.answered.kept.status,
    });

    let outcome;
    await act(async () => {
      outcome = await saveOpenJob(null);
    });

    expect(outcome).toBe("kept-open");
    expect(sentChange(0)).toEqual(capture.sent.stale);
    expect(sent[1]).toEqual({
      method: "POST",
      body: { jobIDs: [jobID] },
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(draft().name).toBe(editorsName);
    expect(draft().build.extrasCosts).toEqual(
      capture.afterIncoming.build.extrasCosts,
    );
    expect(heldJob().name).toBe(incomingName);

    await userEvent.click(screen.getByLabelText(`Keep mine — ${editorsName}`));
    await userEvent.click(screen.getByRole("button", { name: "Save again" }));

    expect(sentChange(2)).toEqual(capture.sent.kept);
    expect(useUsersStore.getState().editSession.activeJobID).toBeNull();
    expect(heldJob()).toMatchObject({
      name: capture.after.name,
      build: { extrasCosts: capture.after.build.extrasCosts },
      _meta: { revision: capture.after._meta.revision },
    });
    expect(answers).toEqual([]);
  });

  it("takes the late delivery of the incoming save as already held", async () => {
    editorTab();
    answers.push(capture.answered.stale, capture.answered.reread, {
      status: capture.answered.kept.status,
    });
    await saveOpenJob(null);
    useUsersStore
      .getState()
      .editSession.actions.settleChangeReview({ keep: [1], letGo: [] });
    await saveOpenJob(null);

    await deliver(
      framesFor("editor").filter((frame) => frame.operationType === "update"),
    );

    expect(heldJob()).toMatchObject({
      name: capture.after.name,
      _meta: { revision: capture.after._meta.revision },
    });
  });
});

describe("the tab editing the job, which was told of the incoming save", () => {
  it("keeps its own value on screen, says so, and saves over the saved job once kept", async () => {
    editorTab();
    render(
      <>
        <IncomingSaveNotice />
        <ChangeReviewDialogue />
      </>,
    );

    await act(() => deliver(framesFor("editor")));

    expect(draft().name).toBe(editorsName);
    expect(draft().build.extrasCosts).toEqual(
      capture.afterIncoming.build.extrasCosts,
    );
    expect(
      screen.getByText(/An incoming save changed .* while you had it open/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Review changes" }),
    );
    await userEvent.click(screen.getByLabelText(`Keep mine — ${editorsName}`));
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));

    answers.push({ status: capture.answered.kept.status });
    await act(async () => {
      expect(await saveOpenJob(null)).toBe("closed");
    });

    expect(sentChange(0)).toEqual(capture.sent.kept);
    expect(heldJob()).toMatchObject({
      name: capture.after.name,
      _meta: { revision: capture.after._meta.revision },
    });
  });
});

describe("the other tabs on the planner", () => {
  it("brings the tab that made the incoming save to what the server stored", async () => {
    tabHolding(capture.afterIncoming);

    await deliver(
      framesFor("member").filter((frame) => frame.operationType === "update"),
    );

    expect(heldJob()).toEqual(toDocument(jobFromDocument(capture.after)));
  });

  it("brings a tab that only watched through both saves to what the server stored", async () => {
    tabHolding(capture.before);

    await deliver(framesFor("bystander"));

    expect(heldJob()).toEqual(toDocument(jobFromDocument(capture.after)));
  });
});
