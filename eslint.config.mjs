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
    // L'application Flutter. Ses artefacts de compilation embarquent du
    // JavaScript tier — `mobile/build/unit_test_assets/` notamment — qu'Eslint
    // parcourait et rapportait comme du code du projet. Les motifs ci-dessus
    // sont relatifs à la racine du dépôt : `build/**` ne couvre pas
    // `mobile/build/`.
    "mobile/**",
  ]),
]);

export default eslintConfig;
