import {
  coreActions,
  jobChangeActions,
  linkingActions,
  stateDefault,
} from "./editSession/index.js";

/**
 * The job the editor is open on, as the layers it is held in rather than as one
 * instance: the document as the server last stated it, what the reader has
 * changed, and what they have asked about.
 *
 * @param {Function} set
 * @param {Function} get
 * @returns {Object}
 */
const editSessionSlice = (set, get) => ({
  editSession: {
    ...stateDefault(),
    actions: {
      ...coreActions(set, get),
      ...jobChangeActions(set, get),
      ...linkingActions(set),
    },
  },
});

export default editSessionSlice;
