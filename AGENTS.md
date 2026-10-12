# Lintel — agent guidance

Lintel is a specification plus data: JSON **manifests** that tell a terminal how to recognise a
reference in its output (issue key, PR, session id…), look it up and render a hover card. There is
no runtime here — `SPEC.md` is the contract, `schema/` the JSON Schema, `integrations/` the
manifests, `presets.json`, `file-types.json` and `paths/` generated catalogues, `site/` the
homepage and docs (lintel.aylith.com). See README.md.

## Commands

```bash
npm test                 # the full conformance suite (conformance/*.mjs)
npm run sync:presets     # regenerate presets.json from integrations/
npm run sync:file-types
npm run sync:paths
npm run preset:add       # scaffold a new integration
cd site && npm ci && node build.mjs && node check.mjs   # build and check the site
```

## Conventions

- A manifest is data only: no code, no process. Anything a terminal would have to execute does not
  belong in a manifest.
- Generated files are checked by `npm test` (`--check`); run the matching `sync:*` script after
  editing `integrations/` and commit both.
- Keep claims about host terminals to what the conformance hosts test actually covers.
- Commit straight to `main` after `npm test` passes.
