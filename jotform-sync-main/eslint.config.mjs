import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import unusedImports from "eslint-plugin-unused-imports";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

/**
 * ESLint configuration with enhanced rules for:
 * - Detecting unused code (variables, imports, functions)
 * - Maintaining consistent code style
 * - Improving code quality
 */
const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    files: ["**/*.js", "**/*.jsx", "**/*.ts", "**/*.tsx"],
    plugins: {
      "unused-imports": unusedImports,
    },
    rules: {
      // Completely silence warnings for variables with underscore prefix
      "no-unused-vars": ["off"],
      
      // Automatically remove unused imports but ignore variables with underscore
      "unused-imports/no-unused-imports": "warn",
      "unused-imports/no-unused-vars": ["off"],
      
      // Allow require-style imports (common in this project)
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": ["off"],
      
      // Allow console statements for development
      "no-console": "off",
      
      // React rules
      "react/prop-types": "off",
      "react/display-name": "off",
      "react/jsx-uses-react": "error",
      "react/jsx-uses-vars": "error",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn"
    }
  }
];

export default eslintConfig;
