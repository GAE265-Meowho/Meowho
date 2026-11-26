import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      // Standalone design prototypes have their own package.json and lint setup.
      "prototypes/**",
      "workers/welfarelens/**",
      // 簡報打包後的靜態檔（含 three.js 壓縮 bundle），不屬於網站程式碼。
      "docs/slides/**",
    ],
  },
];

export default eslintConfig;
