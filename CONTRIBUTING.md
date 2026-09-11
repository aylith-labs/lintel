# Contributing presets and file types

You do not need to build a terminal to contribute. Lintel owns the catalog, integration
matchers, language names, extension mappings and reusable file icons.

## Suggest a preset without writing code

[Open the preset proposal form](https://github.com/aylith-labs/lintel/issues/new?template=preset.yml).
Include an example printed in a terminal and the page it should open. For example:
`UNB-123` → `https://getunblocked.com/dashboard/team/current/coding-task/UNB-123`.
Only use public or invented examples; never include credentials.

## Add a preset yourself

Fork and clone this repository, then run:

```sh
npm run preset:add
npm test
```

The command asks for an ID, label, integration, match kind, example and description.
It validates the example before writing. For an existing integration, it reuses that
manifest's matcher. For a completely new service, it asks for a regex with named
captures and a details URL template and creates the integration manifest too.

Use `npm run preset:add -- --help` for flags, or `--dry-run` to see the proposed JSON
without changing files. You can also edit `presets.json` directly. File presets can
use `fileTypeGroup`, `schemes`, and `extensions`; see `schema/presets-1.json`.

Open a pull request with the catalog entry, any new integration manifest, and an
example. CI checks all examples against their matchers. The Unblocked Code manifest
is a small complete example of a service that only opens a task details page.

## Add a language, mapping or icon

Edit `file-types.json`: each type has a stable ID, full display name, extensions,
optional exact filenames, syntax language, file groups, and SVG/PNG asset paths.
SVG is the portable source; PNG is included for native hosts. Current icons are
Lintel-owned language badges, available under this repository's MIT license.
Add both assets under `icons/files/`. Duplicate extensions or filenames are rejected.
Platform-specific reveal labels are in this same catalog.

```sh
npm run sync:file-types -- --terminal /path/to/terminal --torbie /path/to/torbie
npm run sync:presets -- --terminal /path/to/terminal --torbie /path/to/torbie
npm test
```

Both sync commands support `--check`. Consumers commit generated catalogs and assets,
so their normal builds work offline. Host maintainers bundle new integration manifests
and register them in the host's built-in registry; no C++/TypeScript matcher should be
invented separately. A preset contribution can be reviewed without host checkouts.
