---
name: Lintel
tagline: One manifest, every terminal.
status: active
category: developer-tools
description: A standard for teaching a terminal what the text in it means. A JSON manifest says how to recognise a reference, how to look it up and how to show it; the terminal executes and the manifest only describes. Implemented by the Windows Terminal fork, Torbie and shefrd, with a conformance suite that checks all three against the same files.
links: {"spec": "https://lintel.aylith.com/spec", "site": "https://lintel.aylith.com"}
---

Lintel is the format the Aylith terminals share for link previews and click actions.

A terminal shows you text, and almost all of it is a reference to something that lives
somewhere else. Lintel closes that loop with a file rather than a plugin: hover the text,
get a card; click it, land on the thing.
