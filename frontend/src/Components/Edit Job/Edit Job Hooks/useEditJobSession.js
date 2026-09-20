import { useMemo } from "react";

import Job from "../../../Classes/job";
import useUsersStore from "../../../Zustand/usersStore";
import { draftFor, hasChanges } from "./jobDraftStore";
import { childJobsAfterEdits, parentJobsAfterEdits } from "./jobSelectors";

/**
 * The job as the page reads it: a frozen lens over a document the session holds.
 *
 * @param {object|null|undefined} document
 * @returns {Job|null}
 */
export function jobLens(document) {
  if (!document) return null;

  // The document is frozen, but the instance built around it is a new object:
  // without freezing that too, a field set straight on the job would still be
  // lost quietly rather than saying so.
  return Object.freeze(new Job(document));
}

/**
 * The edit session as the page reads it.
 *
 * `activeJob` is a lens over the draft rather than the thing being edited: it is
 * rebuilt whenever the layers move, and a component that changes the job says so
 * through an action instead of writing into it.
 *
 * It is **frozen**, because the layers under it are. A component that changes the
 * job in place throws where it does so, rather than appearing to work and losing
 * the change at the next read. The one caller that needs a job it can change is
 * the save, which takes its own copy.
 *
 * @returns {{state: object, actions: object}}
 */
export function useEditJobSession() {
  const session = useUsersStore((store) => store.editSession);
  const { draft, activeJobID, actions } = session;

  const activeJob = useMemo(
    () => jobLens(draftFor(draft, activeJobID)),
    [draft, activeJobID],
  );

  const state = useMemo(
    () => ({
      activeJob,
      jobModified: hasChanges(draft),
      isLoading: session.isLoading,
      loadingMessage: session.loadingMessage,
      temporaryChildJobs: session.temporaryChildJobs,
      speculativeChildJobs: session.speculativeChildJobs,
      esiDataToLink: session.esiDataToLink,
      parentChildToEdit: session.parentChildToEdit,
    }),
    [activeJob, draft, session],
  );

  const reads = useMemo(
    () => ({
      getCurrentParentJobs: () =>
        parentJobsAfterEdits(activeJob, session.parentChildToEdit.parentJobs),
      getCurrentMaterialChildJobs: (materialTypeID) =>
        childJobsAfterEdits(
          activeJob,
          materialTypeID,
          session.parentChildToEdit.childJobs,
        ),
    }),
    [activeJob, session.parentChildToEdit],
  );

  return { state, actions: { ...actions, ...reads } };
}
