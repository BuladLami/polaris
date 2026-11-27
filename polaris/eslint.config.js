import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

/**
 * The standard Vite React + TypeScript lint set: ESLint and typescript-eslint
 * recommended rules, the React hooks rules, and the fast-refresh export rule.
 *
 * `src/components/ui/` is vendored (shadcn primitives and mapcn's map.tsx) and
 * is re-pulled from its registries rather than edited, so it is not linted.
 */
export default tseslint.config(
  { ignores: ["build", "dist", "node_modules", "src/components/ui/**"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },
  {
    files: ["scripts/**/*.mjs", "*.config.{js,ts}"],
    languageOptions: { globals: globals.node },
  },
);
