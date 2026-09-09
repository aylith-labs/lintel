# Lintel

**A terminal shows you text. Almost all of it is a reference to something that lives somewhere
else** — an issue key, a session id, a pull request, a pane address. The terminal knows none of it,
so you copy the string into a browser to find out what it is.

Lintel closes that loop with a file. A **manifest** is JSON that says how to recognise a reference,
how to look it up, and how to show it. Hover the text, get a card. Click it, land on the thing. No
plugin code, no process, no extension host — a manifest is data, and the terminal is the only thing
that executes.

```jsonc
{
    "id": "jira",
    "settings": [{ "key": "host", "required": true }],
    "credentials": [{ "key": "email" }, { "key": "token" }],
    "matchers": [
        { "kind": "text", "pattern": "\b(?<key>[A-Z][A-Z0-9]{1,9}-\d{1,7})\b",
          "link": "https://{{settings.host}}/browse/{{key}}", "suggested": true }
    ],
    "fetch": [
        { "id": "issue", "url": "https://{{settings.host}}/rest/api/3/issue/{{key}}",
          "auth": { "type": "basic", "user": "{{credentials.email}}", "password": "{{credentials.token}}" } }
    ],
    "fields": [
        { "key": "summary", "label": "Summary", "path": "/fields/summary", "kind": "title" },
        { "key": "status",  "label": "Status",  "path": "/fields/status/name", "kind": "badge" }
    ]
}
```

That is the whole idea. `CAB-8209` in a build log is now hoverable, and the card says what it is.

## What is here

| | |
|---|---|
| [`SPEC.md`](SPEC.md) | The standard. Start here. |
| [`schema/lintel-1.json`](schema/lintel-1.json) | JSON Schema, for an editor to validate against. |
| [`schemes.md`](schemes.md) | The URI registry — `stith://`, `shefrd://`, and what a host does with one. |
| [`presets.json`](presets.json) | The preset catalogue: ready-made rules, so adding one does not start with writing a regex. |
| [`integrations/`](integrations/) | The canonical manifests. Hosts sync from here. |
| [`conformance/`](conformance/) | `node conformance/run.mjs`. What "conformant" means, executably. |

## Who implements it

| Host | What it is |
|---|---|
| **Windows Terminal** (aylith fork) | C++/WinRT, ICU regex, `Windows.Web.Http`, credentials in the Windows vault. |
| **Torbie** | TypeScript/Angular, JS `RegExp`, Node `https`, credentials via Electron `safeStorage`. |
| **shefrd** | Rust, the multiplexer's own hover and click surface. |

The compatibility test is not a promise, it is a command: `conformance/run.mjs` reads each host's
manifests off disk and reports any key that differs from the canonical copy. A divergence that is
written down in [`conformance/allowances.json`](conformance/allowances.json), with a reason about
the host, is a decision. One that is not is drift, and the suite fails on it.

## Why it has a name

Because "integration manifest" is a description, and a description cannot be cited, versioned or
refused. A lintel is the beam over an opening: it is what lets you put a door in a wall without the
wall coming down, and it is the piece nobody looks at once it is in.
