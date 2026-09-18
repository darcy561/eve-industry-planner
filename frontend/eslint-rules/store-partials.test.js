import { RuleTester } from "eslint";
import storePartials from "./store-partials.js";

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: "latest", sourceType: "module" },
});

ruleTester.run(
  "no-whole-state-spread",
  storePartials.rules["no-whole-state-spread"],
  {
    valid: [
      // The shape the rule is asking for.
      `set((state) => ({ account: { ...state.account, isLoggedIn: true } }), false, "a");`,
      // A slice's own spread is required: the merge is one key deep.
      `set((state) => ({ jobData: { ...state.jobData, ...stateDefault() } }), false, "a");`,
      // Returning the state object itself is the no-change path, not a spread.
      `set((state) => state, false, "a");`,
      // A callback inside the updater has its own parameter and its own return.
      `set((state) => ({ jobData: { rows: state.jobData.rows.map((row) => ({ ...row })) } }), false, "a");`,
      // Only a store write is in scope.
      `produce((state) => ({ ...state, account: {} }));`,
      // React's own setter replaces rather than merges, so its spread must stay.
      `setState((prev) => { const next = { ...prev }; next.open = true; return next; });`,
      // Reached by a computed key, which is not how the store is written to.
      `store["setState"]((state) => ({ ...state, account: {} }), false, "a");`,
      // An inner callback shadowing the name is still not the updater's return.
      `set((state) => ({ jobData: { rows: state.rows.map((state) => ({ ...state })) } }), false, "a");`,
    ],
    invalid: [
      {
        code: `set((state) => ({ ...state, account: { ...state.account } }), false, "a");`,
        output: `set((state) => ({ account: { ...state.account } }), false, "a");`,
        errors: [{ messageId: "wholeState" }],
      },
      // The parameter is not always called `state` — three sweeps missed these.
      {
        code: `set((s) => ({ ...s, account: { ...s.account } }), false, "a");`,
        output: `set((s) => ({ account: { ...s.account } }), false, "a");`,
        errors: [{ messageId: "wholeState" }],
      },
      // A block body returning the partial, rather than an expression body.
      {
        code: `set((state) => { const next = 1; return { ...state, jobData: { next } }; }, false, "a");`,
        output: `set((state) => { const next = 1; return { jobData: { next } }; }, false, "a");`,
        errors: [{ messageId: "wholeState" }],
      },
      // Behind an inner callback, which is how the last two sites hid.
      {
        code: `set((state) => { const rows = state.a.map((r) => r.id); return { ...state, a: rows }; }, false, "a");`,
        output: `set((state) => { const rows = state.a.map((r) => r.id); return { a: rows }; }, false, "a");`,
        errors: [{ messageId: "wholeState" }],
      },
      // The store written directly rather than through a slice action.
      {
        code: `useUsersStore.setState((state) => ({ ...state, account: {} }), false, "a");`,
        output: `useUsersStore.setState((state) => ({ account: {} }), false, "a");`,
        errors: [{ messageId: "wholeState" }],
      },
      // Named before it is returned, which is how one site stayed hidden.
      {
        code: `set((state) => { const next = { ...state, jobData: {} }; return next; }, false, "a");`,
        output: `set((state) => { const next = { jobData: {} }; return next; }, false, "a");`,
        errors: [{ messageId: "wholeState" }],
      },
      // A store held behind a ref, which is the shape the lock tests use.
      {
        code: `storeHolder.current.setState((state) => ({ ...state, account: {} }), false, "a");`,
        output: `storeHolder.current.setState((state) => ({ account: {} }), false, "a");`,
        errors: [{ messageId: "wholeState" }],
      },
      // The fix leaves a comment written between the spread and its comma.
      {
        code: `set((state) => ({ ...state /* why */, account: {} }), false, "a");`,
        output: `set((state) => ({  /* why */ account: {} }), false, "a");`,
        errors: [{ messageId: "wholeState" }],
      },
    ],
  },
);
