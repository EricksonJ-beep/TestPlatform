import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";
import requireAuthz from "./eslint-rules/require-authz.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Turn off formatting rules that would conflict with Prettier.
  prettier,
  {
    // Ticket 0.5: no server action or route handler without an authorization guard.
    plugins: { bloom: { rules: { "require-authz": requireAuthz } } },
    rules: { "bloom/require-authz": "error" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".pglite/**",
  ]),
]);

export default eslintConfig;
