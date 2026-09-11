# The Lintel standard, version 1

**Status: draft.** Two hosts implement it and a third is adopting it. The conformance suite in this
repo is what "implements it" means; where this document and that suite disagree, the suite is the
bug report.

A **manifest** is a JSON document that teaches a terminal to recognise a reference in its output,
look it up, and show what it found. The terminal executes; the manifest only describes.

---

## 1. Conformance language

**MUST**, **MUST NOT**, **SHOULD** and **MAY** are used as in RFC 2119.

A **host** is a program that reads manifests — a terminal, a multiplexer, an editor.
An **author** is whoever writes one.

## 2. Versioning

- A manifest carries `"version"`, an integer. Version 1 is this document.
- A host **MUST** ignore keys it does not recognise, at every level.
- A host **MUST** refuse a manifest whose `version` names a major it does not implement, and
  **MUST** say so rather than partially loading it.
- A key added within a major version **MUST** be optional, and its absence **MUST** mean what the
  behaviour was before it existed.

The rule exists so a manifest can be shared before every host has caught up. `normalize` on a
setting field and `html` at the top level are both live examples: hosts that have never heard of
them behave exactly as they did.

## 3. Discovery

A host **MUST** load manifests from a directory, one manifest per folder as `integration.json`, or
as a bare `<id>.json` directly in that directory. Where that directory is, is the host's business.

- A host **MAY** ship built-in manifests.
- A user manifest whose `id` equals a built-in's **MUST** replace it outright. This is how a shipped
  manifest is forked, or handed to the project it describes.
- A manifest that fails to parse **MUST** be skipped and logged. It **MUST NOT** be fatal.

A registry is the obvious next question and the obvious next mistake. A folder is specified; a
registry can be a layer above one later.

## 4. The manifest

| Key | Type | Meaning |
|---|---|---|
| `id` | string, **required** | Unique. A manifest with no `id` is invalid. |
| `name` | string | Display name. Defaults to `id`. |
| `icon` | string | A URI. Hosts resolve their own built-in names; a third-party manifest **SHOULD** use `https:`, `data:` or `file:`. |
| `version` | integer | See [§2](#2-versioning). |
| `cacheSeconds` | number | How long a fetched result is cached per match. Negative clamps to 0. |
| `settings` | array | Non-secret configuration. Stored wherever the host stores settings. |
| `credentials` | array | Secret configuration. **MUST NOT** be stored with settings. |
| `matchers` | array | How this manifest claims a reference. See [§5](#5-matchers). |
| `fetch` | array | The request pipeline. See [§6](#6-fetch-steps). |
| `fields` | array | How a result renders. |
| `fieldGroups` | array | Named sets of fields. |
| `tabs` | array | Secondary content behind a tab strip. |
| `actions` | array | Things the card can *do* to the thing. See [§7](#7-actions). |
| `detectPatterns` | array of regex | Patterns the host scans plain output for while this manifest is enabled. |
| `html` | string | A full HTML document rendered in place of `fields`. Optional; a host that does not render it **MUST** fall back to `fields`. |

## 5. Matchers

| Key | Type | Meaning |
|---|---|---|
| `kind` | `"link"` or `"text"` | Against a hovered URI, or scanned over terminal text. |
| `pattern` | regex | Named groups become template variables. |
| `hostSetting` | string | **Link matchers only.** See [§9](#9-host-guarding). |
| `link` | template | The URL this match stands for — Open, Copy link, and the click. |
| `open` | string | What the *click* should do instead of following `link`. See below. |
| `suggested` | boolean | **Text matchers only.** Offered to the user as a ready-made rule. |
| `description` | string | Shown beside a suggested matcher. |

**Matching semantics.** A host **MUST** apply a `text` matcher to the matched run as a whole — the
run either is the reference or it is not. A host **MUST** search a `link` matcher within the URI. An
author anchoring a text pattern is therefore writing something already implied.

**`open`.** Some references are not usefully *opened*. A multiplexer pane id names a pane to bring
to the front; a page describing that pane is a consolation prize. `open` names an `actions` entry of
the same manifest, or a built-in button id, and the host runs it instead of following `link`.

- Copy link **MUST** still copy what `link` resolves to. `open` governs the click alone.
- If the action fails, the host **SHOULD** fall back to opening `link`. A click that reports nothing
  and does nothing is worse than one that lands somewhere less useful.
- `open` naming neither an action nor a built-in is **invalid**, and the conformance suite rejects
  it. It would otherwise be a click that silently does nothing, which is the exact failure the key
  was added to remove.

## 6. Fetch steps

| Key | Type | Meaning |
|---|---|---|
| `id` | string | Referenced by later steps, and by field paths as `stepId:pointer`. |
| `type` | `"http"` (default) or `"command"` | A request, or a local process whose stdout is JSON. |
| `url`, `method`, `headers`, `body`, `auth` | | `http` only. `auth` is `basic`, `bearer` or `header`. |
| `commandLine`, `stdin` | template | `command` only. |
| `timeoutMs` | number | Defaults to 8000. |
| `when` / `unless` | template | Run, or skip, when the template expands to something non-empty. |
| `optional` | boolean | A failure is recorded and stepped over rather than ending the pipeline. |
| `allowUntrustedCertificate` | boolean | `http` only. |

Two steps **MAY** share an `id`; the later one that actually runs replaces the earlier result. That
is how `when`/`unless` express a branch without the field paths having to know which arm fired.

## 7. Actions

`"kind": "button"` fires one request. `"kind": "choice"` offers options an earlier step produced and
fires a request for the one picked, available to the template as `{{choice}}`.

Actions are HTTP. A `command` action is deliberately absent: a fetch step runs a local process to
*read*, under a pipeline the user triggered by hovering, and letting a manifest run one to *write*
is a different risk that [§10](#10-capabilities-and-consent) has not yet answered.

## 8. Templates and paths

Every templated string is expanded with mustache-style `{{…}}` substitutions:

| Template | Expands to |
|---|---|
| `{{match}}` | The whole matched text. |
| `{{name}}` | A named capture group. |
| `{{uri}}` | The hovered URI (link matchers). |
| `{{settings.key}}` / `{{credentials.key}}` | A configured value. |
| `{{stepId:/json/pointer}}` | A value from an earlier step's result. |
| `{{choice}}`, `{{field.key}}` | Actions only. |

- An unknown name **MUST** expand to the empty string. Not to an error, and not to the literal. That
  is what makes `when`/`unless` work as presence tests.
- Only *data* values — capture groups and step results — are percent-encoded, and only inside a
  step's `url`. A setting that is a whole scheme and host **MUST** survive unescaped.
- Paths are RFC 6901 JSON pointers with one extension: a negative index counts from the end, so
  `/messages/-1/text` is the last message.
- With more than one fetch step, an unqualified pointer resolves against whichever step ran last and
  produced something — which is rarely the one meant. Authors **SHOULD** qualify, and the
  conformance suite requires it.

## 9. Host guarding

A link matcher **MAY** name one of its own settings as `hostSetting`. The hovered URI's host **MUST**
equal that setting's *current* value or the matcher does not fire — no fetch, and no credential
touched. This is the whole reason a look-alike link can never see a token: the fetch never starts,
because the match never happened.

`hostSetting` is for a host the *user* supplies. Where the host is fixed, pin it in the pattern
instead. It has no meaning on a text matcher — a ticket key has no host to check against — and
carrying one there is invalid.

Further, a host **MUST NOT** fetch unless every `required` setting and every credential has a value
and the manifest is enabled; **MUST NOT** write credentials to the settings file; and **MUST NOT**
let a credential value appear in an error message, a log, or a cached failure.

## 10. Capabilities and consent

**Unresolved, and the largest open question in version 1.** A manifest can issue arbitrary HTTP and
run arbitrary local commands. That is fine for a file you wrote and not fine for one you installed.

Until this section says otherwise, a host **SHOULD** treat a user-installed manifest's `command`
steps as opt-in, and **SHOULD** show the user what a manifest will reach before enabling it.

## 11. Conformance

An implementation is conformant if `conformance/run.mjs` passes against its manifest directory. The
suite checks that every manifest is well formed, that every preset's example is claimed by exactly
one matcher, and that each host ships what this repo says is canonical.

Where a host cannot ship the canonical copy, the divergence goes in `conformance/allowances.json`
with a reason **about the host**. "Not synced yet" is not a reason; it is the finding.

## 12. Still open

Named so they are not mistaken for settled: [§10](#10-capabilities-and-consent) capabilities and
consent; a redaction guarantee stronger than §9's prose; whether `html` earns a sandbox story or
should be dropped in favour of richer field kinds; i18n, since `label` and `description` are single
strings; and a rendering contract saying which `kind` values must render *distinctly* — currently
agreed by imitation, which is exactly how two implementations drift.

## Host file-preview capability

`preview: true` permits a host to render a resolved local file without an integration.
This is a host capability, not a remote integration fetch or a matching tooltip rule.
A rule disabling preview or explicitly selecting an integration retains precedence.
Hosts preserve original link identity separately from a filesystem target resolved in the
originating terminal context (including its WSL distro). Unsupported content must retain
ordinary link actions and report an unavailable preview without another integration's icon.

Windows Terminal supports text, raster images, rendered PDF pages and extracted DOCX/XLSX/PPTX
content. Torbie shares the preset catalog; this does not assert equivalent document rendering.
Office macros, recalculation and external relationships are not part of a content preview.

Preset extension criteria use `extensions`, without leading dots. They participate in rule
identity alongside match kind, schemes and file-type group. The catalog is validated by
`schema/presets-1.json`; integration criteria remain selected by exactly one example match.

### Header fields and field links

A display field may declare `placement: "header"` or `placement: "status"`.
Hosts keep these fields visible above the tabs, following the title. Status
appears beside the integration's state-changing action controls. The default
placement is `details`. Title fields belong below the source link above tabs.

The optional `link` is a URL template using the same substitutions as fetch
URLs, including percent-encoding JSON pointer values. It makes the displayed
value clickable without exposing the raw URL as the label. Jira uses this for
parent issues and searches by issue type or priority. Empty field values are
omitted, including parent links for issues with no parent.
