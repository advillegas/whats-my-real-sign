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
      // R3F idioms require mutating camera/scene objects from useThree() inside
      // useFrame / useEffect. Treat these as warnings only.
      "react-hooks/immutability": "off",
      // Common pattern when resetting derived state in response to a prop change.
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
