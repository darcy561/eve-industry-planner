import {
  ask,
  change,
  changedJobIDs,
  redo,
  undo,
} from "../../Components/Edit Job/Edit Job Hooks/jobDraftStore.js";

/**
 * Changing the job the editor is open on.
 *
 * A component says what the reader did — a command from `jobCommands` — and the
 * store records what that changed. Nothing writes into the job it was handed:
 * the before-image an undo step needs is destroyed by a mutation made in place.
 *
 * @param {Function} set
 * @param {Function} get
 * @returns {Object}
 */
export const jobChangeActions = (set, get) => {
  const record = (recorder, label) => (command, jobID) =>
    set(
      (state) => {
        const target = jobID ?? state.editSession.activeJobID;
        if (!target || !command) return state;
        return {
          editSession: {
            ...state.editSession,
            draft: recorder(
              state.editSession.draft,
              target,
              command.name,
              command.recipe,
            ),
          },
        };
      },
      false,
      label,
    );

  return {
    /**
     * Records a change the reader means to keep.
     *
     * @param {{name: string, recipe: Function}} command
     * @param {string} [jobID] - The job the editor is open on when omitted
     */
    run: record(change, "runJobCommand"),

    /**
     * Records a question the reader asked, which never reaches a save.
     *
     * @param {{name: string, recipe: Function}} command
     * @param {string} [jobID]
     */
    askAbout: record(ask, "askAboutJob"),

    /** Takes back the newest step. */
    undoStep: () => {
      set(
        (state) => ({
          editSession: {
            ...state.editSession,
            draft: undo(state.editSession.draft),
          },
        }),
        false,
        "undoJobStep",
      );
    },

    /** Puts back the step undo last took. */
    redoStep: () => {
      set(
        (state) => ({
          editSession: {
            ...state.editSession,
            draft: redo(state.editSession.draft),
          },
        }),
        false,
        "redoJobStep",
      );
    },

    /**
     * The jobs the session has changes for, which is what a save collects.
     *
     * @returns {Array<string>}
     */
    changedJobIDs: () => changedJobIDs(get().editSession.draft),
  };
};
