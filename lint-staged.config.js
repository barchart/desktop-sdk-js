// The pre-commit hook (.husky/pre-commit): lint and format the staged files. One task list per file, so ESLint and
// Prettier never write the same file at once. Typecheck, tests and the build stay in `yarn check`.
export default {
    "*.{ts,js}": ["eslint --fix", "prettier --write"],
    "*.{json,yml}": "prettier --write",
};
