---
name: Lintel
tagline: Shared manifests for terminal link previews.
category: developer-tools
description: A shared manifest format for terminal link previews and actions. Lintel supplies integration data, presets and conformance checks for consuming terminals; it is not a standalone terminal app.
---

Lintel is a supporting protocol for terminal link previews and click actions. Torbie bundles six integration manifests. The Windows Terminal fork is documented as a consumer; its manifest parity can be checked when its checkout is available. Shefrd provides addresses that terminals can recognize; it is not checked as a manifest host by Lintel's runner.

An integration manifest describes references, lookups, cards and click actions. A consuming
terminal executes it. Lintel's conformance checks validate canonical manifests, preset examples
and the manifest copies in any host directory explicitly supplied to the runner. They do not
verify all runtime behavior, credential handling or action safety.
