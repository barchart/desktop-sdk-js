# Contributing

## Setup

```sh
corepack enable      # once per machine: Yarn's version comes from packageManager in package.json
yarn install
yarn check           # everything CI runs: typecheck, lint, format, tests, build, package checks
```

Commit messages are [conventional commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:`…; `feat!:` or a `BREAKING CHANGE:` footer for a breaking change). They set the next version and become the changelog, so write them for the SDK's users.

The git hooks (`.husky/`) check that before each commit: the commit message with commitlint, and the staged files with ESLint and Prettier (`lint-staged.config.js`). They aren't installed by `yarn install`, since this repository runs no install scripts, its dependencies' included (`enableScripts: false` in `.yarnrc.yml`). `yarn build`, `yarn build:watch` and `yarn check` install them instead; `yarn hooks:install` does it on its own.

## Working on the SDK inside an application

To run your changes in an application, link this repository into it and keep a build running here:

```sh
yarn build:watch   # rebuilds dist/ on every change, with source maps into src/
```

Linking depends on the application's package manager:

- **Yarn 1:** run `yarn link:dev` here once; it registers the package with Yarn 1 (`yarn unlink:dev` removes it). Then run `yarn link @barchart/desktop-sdk-js` in the application.
- **Yarn 2 or later:** run `yarn link <path to this repository>` in the application.
- **npm:** run `npm link` here, then `npm link @barchart/desktop-sdk-js` in the application.

This repository uses Yarn 4, whose `yarn link` works from the application's side, so a plain `yarn link` here doesn't register anything for Yarn 1. `link:dev` runs Yarn 1 for that one command; `yarn` in this folder stays Yarn 4.

**The application must use its own `@openfeed/sdk-js` and `long`.** A linked package resolves its imports from this repository's `node_modules`, which has its own copies (for the tests). Two copies mean two Openfeed clients and two sets of protocol types and enums. With Vite:

```ts
resolve: { dedupe: ["@openfeed/sdk-js", "long"] },
optimizeDeps: { exclude: ["@barchart/desktop-sdk-js"] }, // picks up the rebuilds
```

The source maps `build:watch` writes point into `src/`, so the debugger and "Go to definition" open the TypeScript sources.
