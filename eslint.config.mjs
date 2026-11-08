import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";

export default defineConfig([
  globalIgnores(["coverage/**", "templates/**"]),
  {
    name: "toolkit/node-esm",
    files: ["{bin,src,scripts,test}/**/*.{js,mjs}", "eslint.config.mjs"],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: globals.nodeBuiltin,
    },
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
  },
]);
