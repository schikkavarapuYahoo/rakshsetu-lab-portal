import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // React 19's `react-hooks/set-state-in-effect` and
      // `react-hooks/purity` rules are very strict about patterns
      // that are widely used and correct in practice — e.g. reading
      // browser-only state (window / Notification permissions) in a
      // mount effect to avoid SSR hydration mismatches, or starting a
      // ticking clock with `useState(0)` and setting the real time
      // inside `useEffect`. The strictly-pure alternative is
      // `useSyncExternalStore`, which is a bigger refactor across
      // many hooks. Downgrade both to warnings so they nudge a future
      // migration without failing the build.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
    },
  },
]);

export default eslintConfig;
