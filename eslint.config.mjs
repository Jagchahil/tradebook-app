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
    // Orphaned file handles from the Cowork FUSE mount. Not source, and they are stale copies of
    // real pages, so linting them reports faults that were fixed in the file that actually ships.
    "**/.fuse_hidden*",
    // The holding pen for code on its way out. It is already excluded by tsconfig and .vercelignore;
    // eslint was the only one of the three that still read it, so a deletion in progress failed the
    // lint over faults in files that are being deleted. The three lists now agree.
    "_to_delete/**",
  ]),

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 THE REACT HOOKS RULES ONLY APPLY WHERE THERE IS REACT.
  //
  // "Use of home" is the HMRC expense allowance for working from your kitchen table, and
  // lib/elections.ts exports useOfHomeToDate and useOfHomeFullYear to work it out. The rule sees a
  // function named use* and reports twenty nine violations for calling a hook conditionally, in an
  // async function, and inside a callback, in a server route and two test files that contain no
  // React whatsoever.
  //
  // ⚠️ THE FIX IS NOT TO RENAME THE TAX FUNCTIONS. They are named after the thing they calculate,
  // that name appears in HMRC's own guidance, and lib/elections.ts is engine code that
  // test/onlyoneengine.test.mjs exists to keep everybody agreeing on. Renaming a tax function to
  // quieten a React linter is the tail wagging the dog.
  //
  // So the React rules are switched off for files that are not React. Nothing is suppressed in any
  // component: every .tsx under app/ and components/ is still fully linted.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  {
    files: ["app/api/**/*.ts", "lib/**/*.ts", "test/**", "scripts/**"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/immutability": "off",
    },
  },

  // test/logic.test.js is CommonJS on purpose and loads the compiled engine with require(). The
  // rule is right about application code and has nothing to say about a script like this one.
  {
    files: ["test/**/*.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
]);

export default eslintConfig;
