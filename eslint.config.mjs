import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // The current codebase is not fully React Compiler-rule clean yet.
    // Keep the core Hooks rules from Next, but do not fail lint on compiler-only
    // migration rules that would require broad behavioral refactors.
    rules: {
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/static-components": "off",
    },
  },
  {
    files: ["electron/**/*.js", "scripts/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated artifacts and local runtime folders:
    "dist/**",
    "dist-electron/**",
    "dist-backend/**",
    "build-backend/**",
    "node_modules/**",
    ".venv/**",
    ".venv_broken_*/**",
  ]),
]);

export default eslintConfig;
