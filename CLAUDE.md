# CLAUDE.md

Guidance for Claude Code (claude.ai/code) in this repository.

## What this is

`@barchart/desktop-sdk-js`: live market state on top of the Openfeed client, `@openfeed/sdk-js`. It subscribes, applies snapshots and updates, and keeps quotes, order books and cumulative volume per instrument. Open source (see `LICENSE`), published to npm. Customers use it through the Barchart Desktop API.

- `src/`: the SDK. `src/index.ts` is the only public entry; everything else is internal.
- `test/`: Vitest. `test/helpers.ts` builds protocol messages; `desktop-sdk.test.ts` replaces the Openfeed client with a fake (`vi.mock`).
- `docs/reference.md`: every public method and the shapes it returns. `docs/design.md`: the internals, for contributors and ports.
- `examples/`: short programs, one task each. They import `@barchart/desktop-sdk-js`, which `tsconfig.json`'s `paths` points at `src/`, so `yarn typecheck` checks them against the current API. They aren't run.
- `llms.txt`: the summary and links that AI assistants read ([llmstxt.org](https://llmstxt.org/)).
- `CHANGELOG.md`: written by release-please; don't edit it by hand.

The npm package ships `dist/`, `docs/`, `examples/`, `llms.txt`, `README.md` and `LICENSE`, so an assistant in a user's project finds the docs in `node_modules`. It has no maps, since it has no `src/` for them to point at.

## Debugging in an application

`CONTRIBUTING.md`, "Working on the SDK inside an application": link the repo into the application and run `yarn build:watch` here. For a Yarn 1 application, `yarn link:dev` registers the package with Yarn 1 (this repo's Yarn 4 `yarn link` works from the application's side instead). The application's bundler must resolve `@openfeed/sdk-js` and `long` to its own copies (Vite: `resolve.dedupe`), or there are two Openfeed clients and two copies of the protocol types. Keep `CONTRIBUTING.md` in step with the scripts and the commit rules.

## Commands

```shell
corepack enable      # once per machine: Yarn's version comes from packageManager in package.json
yarn install
yarn hooks:install   # husky's git hooks (commitlint on commit-msg, lint-staged on pre-commit); build and build:watch run it first
yarn check           # everything CI runs: typecheck, lint, format:check, test, build, check:package, check:esm
yarn typecheck       # TypeScript 7 (`typescript-7` alias), noEmit
yarn lint            # ESLint: every core rule and typescript-eslint strict, with types
yarn format          # Prettier
yarn test            # Vitest; yarn test:watch to watch
yarn build           # TypeScript 7 (tsconfig.build.json): src/ into dist/, then tsc-alias adds .js to relative imports
yarn build:watch     # the same on every change, with source and declaration maps into src/, for a linked package
yarn link:dev        # registers this package with Yarn 1, for linking into a Yarn 1 application (unlink:dev undoes it)
yarn check:esm       # loads the built package in Node, as a user would
yarn commitlint --from main   # checks the branch's commit messages, as CI does on pull requests
```

Yarn 4, with `nodeLinker: node-modules` (`.yarnrc.yml`). It holds back packages published less than a day ago (`npmMinimalAgeGate`), so pin a version that old when upgrading.

## Supply chain

- **No install scripts:** `enableScripts: false` in `.yarnrc.yml`, so no dependency's `preinstall`/`install`/`postinstall` runs, and this package has none either (husky's hooks are installed by `yarn build` and `yarn build:watch`, through `yarn hooks:install`, not by `postinstall`). A dependency that truly needs its build script gets `dependenciesMeta: { "<name>": { "built": true } }` in `package.json`, as a reviewed exception.
- **Pinned versions:** dev dependencies are exact versions, and `yarn install --immutable` in CI installs exactly `yarn.lock`.
- **Workflows:** actions are pinned to commit SHAs, with the version in a comment; update the SHA and the comment together. Jobs get the fewest permissions they need, and checkouts don't keep the token (`persist-credentials: false`).
- **Code owners** (`.github/CODEOWNERS`): changes to `.github/` (the workflows, and the owners file itself) and to `.yarnrc.yml` need a review from one of the owners.
- **Build and publish are separate jobs** (`release.yml`): `build` installs, checks and packs `package.tgz` with read-only access and no secrets; `publish` downloads that tarball and runs only `npm stage publish package.tgz --ignore-scripts`, with no checkout and no install, so dependency code never runs next to the npm credentials.

## Toolchain

- **ES modules only, built by `tsc`.** No bundler: each source file becomes one `.js` and `.d.ts` in `dist/`. CommonJS users `require()` it on Node 22.12+, and bundlers take ESM. **Relative imports have no extension** (`from "./types"`); after `tsc`, `tsc-alias --resolve-full-paths` adds `.js` to them in `dist/` (JavaScript and declarations), as Node's ESM loader needs. `yarn check:esm` fails if one is missed. Type resolution is `Bundler`, because `@openfeed/sdk-js`'s declarations don't resolve under `NodeNext`.
- **Two TypeScripts.** TypeScript 7 typechecks and builds (`yarn typecheck`, `yarn build`, through the `typescript-7` alias). TypeScript 6 is installed as `typescript` only because typescript-eslint doesn't support 7 yet. Drop 6 once typescript-eslint supports 7.
- **Peer dependencies:** `@openfeed/sdk-js` and `long`. The application and the SDK share one client and one copy of the protocol types. Both are also dev dependencies, for the tests.
- **`@openfeed/sdk-js`'s declarations** import their message types through a path alias (`@gen/...`) and without file extensions, which don't resolve in an installed package, so its listeners' parameters are `any` (and `NodeNext` resolution can't read them at all). `desktop-sdk.ts` types them explicitly; keep it that way until the client's published types are fixed.
- **Portable core:** `src/` must run anywhere JavaScript does. ESLint bans `window` and `document` there; the DOM lib stays in tsconfig only for `console` and `setTimeout`.
- **Prettier:** 150 columns, 4 spaces, ES5 trailing commas (`.prettierrc`).
- **ESLint** (`eslint.config.js`): every core rule (`js.configs.all`) and typescript-eslint `strictTypeChecked`, minus the rules the config turns off. `curly` stays on after `eslint-config-prettier`. Three rules are off for this code's design, each with its reason in the config: `no-void`, `no-await-in-loop`, and `no-console` in `examples/`. In practice: functions are `const` arrow functions declared before their use, one class per file, no `!` assertions, no `continue`, and a function's complexity at most 20. Prettier runs on its own (`yarn format`, format on save), not through ESLint. The getter tables in `formatted-session.ts` and `formatted-best-bid-offer.ts` are `// prettier-ignore` on purpose.

## Rules

- **The docs are for people using the SDK.** Keep `README.md`, `docs/`, `examples/` and `llms.txt` in step with changes to the public API or behavior. They describe how the SDK behaves and how to use it, plainly. Protocol details belong to Openfeed's documentation: link to it rather than restating it.
- **Code comments say what the code does and why,** never its history.
- **Names:** `get…` for lookups, `has…`/`is…` for predicates, `remove`/`clear` for removal, `try…` for an action that may not happen. `interface` for object shapes, `type` for unions and function types.
- **Listeners are never called synchronously inside `subscribe`;** the first callback comes from the subscription loop. Callers rely on holding the handle first.
- **One visible flow:** subscribing and closing go through the subscription loop; coalesced events through the delivery loop. No other deferrals, timers or microtasks.
- **Every change** passes `yarn check`, with tests for new behavior.
- **Commit messages are conventional commits** (`feat:`, `fix:`, `docs:`, `chore:`…; `feat!:` or a `BREAKING CHANGE:` footer for breaking changes). They set the next version and become the changelog, so write them for users. With squash merges, the PR title is the commit.

## Releasing

release-please (`.github/workflows/release.yml`, `release-please-config.json`, `.release-please-manifest.json`) keeps a release PR open on `main`. It bumps `version` in `package.json` from the commits since the last release (`fix` a patch, `feat` a minor; before 1.0 a breaking change is a minor too) and adds them to `CHANGELOG.md`. Merging it tags the release and creates the GitHub release; the same workflow then builds and checks the tarball (`build`) and publishes it to npm (`publish`), public and with provenance (`publishConfig`). Don't bump `version` by hand.

Publishing uses npm's trusted publishing: npm trusts this repository's `release.yml`, in the `npm` environment, through OIDC. There's no npm token anywhere, and the package refuses publishes with one. Two people-gates: the `npm` environment in the repository's settings requires an approval before the publish job runs, and the job only stages the version (`npm stage publish`; the trusted publisher allows staging, not `npm publish`). It goes public once a maintainer approves the staged version on npmjs.com, or with `npm stage approve`, with 2FA.
