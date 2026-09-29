import { placeConstraints } from "../../Context/defaultValues";

/**
 * Whether one of a constraint's `when` entries describes this setup.
 *
 * @param {Object} match - One `when` entry
 * @param {Object} setup - The setup or structure being read
 * @returns {boolean}
 * @private
 */
function matches(match, setup) {
  return Object.entries(match).every(
    ([field, value]) => setup?.[field] === value,
  );
}

/**
 * The constraints in force for a setup, in the order they are declared.
 *
 * @param {Object} setup - A setup or a structure being edited
 * @returns {Array<Object>}
 */
export function constraintsFor(setup) {
  if (!setup) return [];

  return placeConstraints.filter((constraint) => {
    if (constraint.jobTypes && !constraint.jobTypes.includes(setup.jobType)) {
      return false;
    }
    return constraint.when.some((match) => matches(match, setup));
  });
}

/**
 * Every field the constraints in force fix, and the value each is fixed to. A
 * later constraint wins a field an earlier one also fixes.
 *
 * @param {Object} setup - A setup or a structure being edited
 * @returns {Object}
 */
export function forcedFieldsFor(setup) {
  return constraintsFor(setup).reduce(
    (forced, constraint) => ({ ...forced, ...constraint.forces }),
    {},
  );
}

/**
 * The figures a place gives only to a character flying for one of the militias it
 * names.
 *
 * @param {Object} setup - A setup or a structure being edited
 * @param {number|null} [enlistedFaction] - The militia the character flies for
 * @returns {Object}
 */
export function enlistedValuesFor(setup, enlistedFaction = null) {
  return constraintsFor(setup).reduce((values, constraint) => {
    const enlisted = constraint.enlistedValues;
    if (!enlisted || !enlisted.factions.includes(enlistedFaction))
      return values;

    const { factions: _factions, ...figures } = enlisted;
    return { ...values, ...figures };
  }, {});
}

/**
 * The options a field may offer before any place narrows them: everything its kind
 * carries, less the entries kept only so stored data still reads.
 *
 * @param {Object} table - One of the option tables, keyed by id
 * @returns {Array<Object>}
 */
export function offerableOptions(table) {
  return Object.values(table ?? {}).filter((entry) => !entry?.legacy);
}

/**
 * The options a field may offer: the one value a constraint fixes it to, or every
 * candidate when nothing fixes it.
 *
 * @param {Object} setup - A setup or a structure being edited
 * @param {string} field - The field being chosen
 * @param {Array<Object>} candidates - Every option the field could offer
 * @returns {Array<Object>}
 */
export function allowedOptionsFor(setup, field, candidates) {
  const forced = forcedFieldsFor(setup);
  if (!Object.hasOwn(forced, field)) return candidates;
  if (routeInto(setup, field)) return candidates;

  return candidates.filter((candidate) => candidate?.id === forced[field]);
}

/**
 * The `when` entry that a field currently puts this setup under a place by, which
 * is the field a reader changes to leave again.
 *
 * @param {Object} setup - A setup or a structure being edited
 * @param {string} field - The field being chosen
 * @returns {{constraint: Object, route: Object}|null}
 * @private
 */
function routeInto(setup, field) {
  for (const constraint of constraintsFor(setup)) {
    const route = constraint.when.find(
      (match) => Object.hasOwn(match, field) && matches(match, setup),
    );
    if (route) return { constraint, route };
  }
  return null;
}

/**
 * The fields a place no longer decides once this choice takes the setup out of it,
 * so a reader is never held somewhere by the values that place set.
 *
 * @param {Object} setup - The setup before the choice
 * @param {string} field - The field the reader chose
 * @param {*} value - What they chose
 * @returns {Array<string>}
 */
export function fieldsReleasedBy(setup, field, value) {
  const released = new Set();

  for (const constraint of constraintsFor(setup)) {
    const forces = constraint.forces ?? {};
    if (!Object.hasOwn(forces, field) || forces[field] === value) continue;

    for (const forced of Object.keys(forces)) {
      if (forced !== field) released.add(forced);
    }
  }
  return [...released];
}

/**
 * A setup as the place it is in settles it, for a surface that displays what a
 * setup is rather than what the reader last chose.
 *
 * @param {Object} setup - A setup or a structure being read
 * @returns {Object}
 */
export function settledSetup(setup) {
  if (!setup) return setup;

  return { ...setup, ...forcedFieldsFor(setup) };
}

/**
 * The value a field holds once the place it is in has had its say.
 *
 * @param {Object} setup - A setup or a structure being edited
 * @param {string} field - The field being read
 * @param {*} own - What the setup itself carries
 * @returns {*}
 */
export function settledFieldFor(setup, field, own) {
  const forced = forcedFieldsFor(setup);
  return Object.hasOwn(forced, field) ? forced[field] : own;
}

/**
 * The kinds of job a system allows, or null when it allows every kind.
 *
 * @param {number} systemID - The solar system
 * @returns {Array<number>|null}
 */
export function jobTypesAllowedIn(systemID) {
  const named = placeConstraints.filter((constraint) =>
    constraint.when.some((match) => match.systemID === systemID),
  );
  if (named.length === 0) return null;

  return named.flatMap((constraint) => constraint.jobTypes ?? []);
}
