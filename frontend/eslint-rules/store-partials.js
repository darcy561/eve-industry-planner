/**
 * Zustand's `setState` merges what an updater returns onto the state it was
 * given, so the updater returns a partial naming the slices it changes. A
 * leading spread of its own parameter builds the whole store into an object the
 * store is about to be spread under anyway.
 *
 * Written as a rule rather than a `no-restricted-syntax` selector because the
 * check is whether the spread names *this updater's* parameter, and a selector
 * cannot refer back to a binding it matched earlier.
 *
 * Rule: technical-documentation/frontend/technical-rules.md § Writing to a store slice.
 */

/**
 * Whether a call writes the store.
 *
 * A slice action is handed its `set`, and everything else reaches the store by
 * name — `useUsersStore.setState(...)`. A bare `setState` is React's own setter
 * from `useState`, which replaces rather than merges: the spread this rule
 * deletes is load-bearing there, so it must not match.
 */
function isStoreWrite(callee) {
  if (callee.type === "Identifier") return callee.name === "set";
  return (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.property.name === "setState"
  );
}

const FUNCTION_TYPES = new Set([
  "FunctionExpression",
  "FunctionDeclaration",
  "ArrowFunctionExpression",
]);

/**
 * Every object the updater returns, skipping any nested function — a callback's
 * own return is not the partial the store receives.
 *
 * A return of a `const` the updater built is followed to the object it was
 * built from: naming the partial before returning it is one of the shapes that
 * hid this from a search for the returned literal.
 *
 * @param {object} updater
 * @returns {object[]}
 */
function returnedObjects(updater) {
  const found = [];
  if (updater.body.type === "ObjectExpression") found.push(updater.body);

  /** @type {Map<string, object|null>} name → the object it holds, or null if it is not one object */
  const objectConsts = new Map();
  const returnedNames = [];

  (function walk(node) {
    if (!node || typeof node.type !== "string") return;
    if (node !== updater && FUNCTION_TYPES.has(node.type)) return;

    if (node.type === "VariableDeclarator" && node.id.type === "Identifier") {
      const name = node.id.name;
      // A name bound twice, or later reassigned, is not followed at all rather
      // than followed to the wrong one.
      objectConsts.set(
        name,
        objectConsts.has(name) || node.init?.type !== "ObjectExpression"
          ? null
          : node.init,
      );
    }
    if (
      node.type === "AssignmentExpression" &&
      node.left.type === "Identifier"
    ) {
      objectConsts.set(node.left.name, null);
    }
    if (node.type === "ReturnStatement") {
      if (node.argument?.type === "ObjectExpression") found.push(node.argument);
      else if (node.argument?.type === "Identifier") {
        returnedNames.push(node.argument.name);
      }
    }

    for (const key of Object.keys(node)) {
      if (key === "parent") continue;
      const value = node[key];
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value.type === "string") walk(value);
    }
  })(updater.body);

  for (const name of returnedNames) {
    const object = objectConsts.get(name);
    if (object) found.push(object);
  }

  return found;
}

const noWholeStateSpread = {
  meta: {
    type: "problem",
    docs: {
      description:
        "a store updater returns a partial, so it does not spread the state it was given",
    },
    schema: [],
    fixable: "code",
    messages: {
      wholeState:
        "`...{{name}}` is a no-op: the store merges this partial onto the state the updater was given. Name only the slices being changed.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (!isStoreWrite(node.callee)) return;

        const updater = node.arguments[0];
        if (!updater || !FUNCTION_TYPES.has(updater.type)) return;
        if (updater.params[0]?.type !== "Identifier") return;

        const stateParam = updater.params[0].name;
        for (const object of returnedObjects(updater)) {
          for (const property of object.properties) {
            if (
              property.type === "SpreadElement" &&
              property.argument.type === "Identifier" &&
              property.argument.name === stateParam
            ) {
              context.report({
                node: property,
                messageId: "wholeState",
                data: { name: stateParam },
                fix: (fixer) => {
                  const source = context.sourceCode;
                  const comma = source.getTokenAfter(property);
                  const hasComma = comma?.value === ",";
                  const adjacent = source.getTokenAfter(property, {
                    includeComments: true,
                  });

                  // A comment written between the spread and its comma is the
                  // one thing here worth more than the tidy-up: take the spread
                  // and the comma as two removals and leave it standing, rather
                  // than one sweep that would carry it off.
                  if (hasComma && adjacent !== comma) {
                    return [fixer.remove(property), fixer.remove(comma)];
                  }

                  // Otherwise take the whitespace after it too, so the key that
                  // follows does not keep the removed one's indentation.
                  const last = hasComma ? comma : property;
                  const next = source.getTokenAfter(last, {
                    includeComments: true,
                  });
                  const end = next ? next.range[0] : last.range[1];
                  return fixer.removeRange([property.range[0], end]);
                },
              });
            }
          }
        }
      },
    };
  },
};

export default {
  meta: { name: "store-partials" },
  rules: { "no-whole-state-spread": noWholeStateSpread },
};
