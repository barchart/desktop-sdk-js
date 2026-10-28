import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

// Every core rule and typescript-eslint strict, with type information, minus the rules turned off below.
export default defineConfig(
    { ignores: ["dist", "node_modules"] },
    js.configs.all,
    tseslint.configs.strictTypeChecked,
    {
        languageOptions: {
            parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
        },
        rules: {
            "id-length": "off",
            "no-magic-numbers": "off",
            "no-undefined": "off",
            camelcase: "off",
            "capitalized-comments": "off",
            "max-statements": "off",
            "max-lines": "off",
            "max-lines-per-function": "off",
            "max-params": "off",
            "no-ternary": "off",
            "no-underscore-dangle": "off",
            "sort-keys": "off",
            "sort-imports": "off",
            "sort-vars": "off",
            "one-var": "off",
            "require-unicode-regexp": "off",
            "prefer-named-capture-group": "off",
            "prefer-destructuring": [
                "warn",
                {
                    VariableDeclarator: { array: true, object: true },
                    AssignmentExpression: { array: false, object: false },
                },
            ],
            // `void promise` marks a promise left running on purpose, as no-floating-promises asks
            "no-void": "off",
            // the subscription and delivery loops await one step at a time, in order
            "no-await-in-loop": "off",
        },
    },
    {
        // the SDK runs anywhere JavaScript does: no browser globals
        files: ["src/**/*.ts"],
        rules: {
            "no-restricted-globals": ["error", "window", "document"],
        },
    },
    {
        // examples print what they get
        files: ["examples/**/*.ts"],
        rules: {
            "no-console": "off",
        },
    },
    { files: ["**/*.js"], extends: [tseslint.configs.disableTypeChecked] },
    prettier,
    {
        // eslint-config-prettier turns curly off, though it agrees with Prettier in its default ("all") form
        rules: {
            curly: "error",
        },
    }
);
