import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import vitest from "@vitest/eslint-plugin";
import testingLibrary from "eslint-plugin-testing-library";
import prettier from "eslint-config-prettier/flat";
import storePartials from "./eslint-rules/store-partials.js";

export default [
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "src/routeTree.gen.js",
      ".tanstack/**",
      // Placeholder tokens here are substituted at deploy time by
      // deployment/runtimeConfig.js, so this is a template rather than source.
      "public/env.js",
    ],
  },

  js.configs.recommended,
  reactHooks.configs.flat.recommended,
  jsxA11y.flatConfigs.recommended,

  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,
        // Substituted at build time by the `define` block in vite.config.js.
        __APP_VERSION__: "readonly",
      },
    },
    rules: {
      // A leading underscore is the tree's existing mark for a binding that
      // exists to hold a position — a Zustand `_get`, an event arg the handler
      // ignores — and must stay for arity or destructuring order.
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          // `const { owner, ...query } = x` names `owner` in order to keep it
          // out of `query`. Reading it would defeat the point, so the binding
          // is used precisely by going unread.
          ignoreRestSiblings: true,
        },
      ],
    },
  },

  {
    // A `set` / `setState` updater returns a partial the store merges onto the
    // state it was handed, so spreading that state back in does nothing. The
    // pattern reads as correct and had grown to 145 sites; a lint rule catches
    // it where review kept not to.
    files: ["src/**/*.{js,jsx}"],
    plugins: { "store-partials": storePartials },
    rules: { "store-partials/no-whole-state-spread": "error" },
  },

  {
    files: ["src/**/*.test.{js,jsx}", "src/tests/**/*.{js,jsx}"],
    plugins: { vitest, "testing-library": testingLibrary },
    languageOptions: {
      globals: { ...vitest.environments.env.globals, ...globals.node },
    },
    rules: {
      ...vitest.configs.recommended.rules,
      ...testingLibrary.configs["flat/react"].rules,
      // Vitest's `expect(value, message)` carries a failure label; the corpus
      // tests use it to name the case that failed. The rule defaults to Jest's
      // one-argument form.
      "vitest/valid-expect": ["error", { maxArgs: 2 }],

      // These three ask for a testing style the SPA's tests deliberately do not
      // follow, and following it would cost coverage rather than gain it.
      //
      // A chart draws SVG paths that carry no role, name or text, so asserting
      // that a series drew at all can only be done by selector — and a series
      // pointing at a missing axis draws nothing silently, which is exactly
      // what those tests catch. The same goes for asserting an EVE type icon
      // rendered, counting loading skeletons, and walking from a cell to the
      // row that holds it.
      "testing-library/no-node-access": "off",
      "testing-library/no-container": "off",
      // The naming rule assumes a function called `render*` returns a render
      // result. Here they mostly return what the test asserts on — the
      // `onChange` spy they wired up, or a hook's value — so renaming those
      // bindings to `view` would describe them wrongly.
      "testing-library/render-result-naming-convention": "off",
    },
  },

  {
    // A dialogue opens in response to the reader's own action, and focus is
    // expected to move into it. The rule guards against autofocus on page
    // load, which is a different thing.
    files: ["src/Components/Dialogues/**/*.jsx"],
    rules: { "jsx-a11y/no-autofocus": "off" },
  },

  {
    files: ["*.config.{js,mjs}", "deployment/**/*.{js,mjs}"],
    languageOptions: {
      sourceType: "module",
      globals: { ...globals.node },
    },
  },

  prettier,
];
