import {
  jobTypeNames,
  jobTypes,
} from "../../../../../../Context/defaultValues";

/**
 * The mark at the head of a material row: how the material is being sourced.
 *
 * Plain means it is bought; linked or pending means something is building it.
 * Three separate facts in one glyph — the kind of thing it is, whether a child
 * job has it, and whether the account excludes it from builds — so they are
 * worked out here rather than in the row that draws them.
 */

/**
 * @enum {string}
 */
export const SOURCING_MARK = {
  /** Nothing is building it. */
  PLAIN: "plain",
  /** A child job is linked. */
  LINKED: "linked",
  /** A child job is intended but not linked yet. */
  PENDING: "pending",
};

/**
 * @typedef {object} SourcingMark
 * @property {string} kind - One of SOURCING_MARK
 * @property {string} label - What a reader is told on hover
 * @property {number} jobType - For the accent colour the row resolves
 * @property {boolean} isUnsettled - Pending against a type that could be linked,
 *   which the row marks amber rather than by job type
 * @property {boolean} isExempt - Excluded from builds by the account's settings
 */

/**
 * @param {object} params
 * @param {number} params.jobType
 * @param {boolean} params.hasLinked
 * @param {boolean} params.hasPending - A temporary or pending-add child job
 * @param {boolean} [params.isExempt]
 * @returns {SourcingMark}
 */
export function sourcingMark({
  jobType,
  hasLinked,
  hasPending,
  isExempt = false,
}) {
  const name = jobTypeNames[jobType] ?? "Material";

  const kind = hasLinked
    ? SOURCING_MARK.LINKED
    : hasPending
      ? SOURCING_MARK.PENDING
      : SOURCING_MARK.PLAIN;

  // Only a type that can actually be built has an unsettled state: a base
  // material with something pending against it is not waiting on anything.
  const buildable =
    jobType === jobTypes.manufacturing || jobType === jobTypes.reaction;

  return {
    kind,
    jobType,
    isUnsettled: buildable && !hasLinked && hasPending,
    isExempt,
    label: markLabel(name, kind, isExempt),
  };
}

/**
 * @param {string} name
 * @param {string} kind
 * @param {boolean} isExempt
 * @returns {string}
 */
function markLabel(name, kind, isExempt) {
  const base =
    kind === SOURCING_MARK.LINKED
      ? `${name} Linked`
      : kind === SOURCING_MARK.PENDING
        ? `${name} Pending`
        : name;

  return isExempt ? `${base} — exempt from builds` : base;
}
