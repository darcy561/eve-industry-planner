import { useJobDraft } from "./useJobDraft";
import { selectedSetupOf } from "./jobSelectors";

/**
 * The setup the reader has open, as the job stores it.
 *
 * Both halves are selected on their own: the setups change as the reader edits
 * one, and which is open changes as they pick another, and a panel reading the
 * setup follows both without following the rest of the job.
 *
 * @returns {object|undefined}
 */
export function useSelectedSetup() {
  const setups = useJobDraft((job) => job.build.setup);
  const setupToEdit = useJobDraft((job) => job.layout.setupToEdit);
  return selectedSetupOf(setups, setupToEdit);
}
