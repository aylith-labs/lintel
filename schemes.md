# The URI registry

A manifest can own a scheme. This is the list of the ones that are taken, what each verb means, and
what a host is expected to do with one.

Registering a scheme here is cheap and refusing to is expensive: two tools that both decide to mean
something by `agent://` is a problem no amount of local care fixes.

## Why a host should not hand these to the OS

A custom scheme reaching `ShellExecute` (or `xdg-open`, or `open`) needs a registered protocol
handler **that implements the verb you used**. Partial handlers are the common case and the worst
one: on the machine this standard was written on, `stith://` was registered to a program that
answered `session` and `copy` and silently dropped `focus`, `focus-pane` and `rule`. Those came back
`SE_ERR_NOASSOC` and the terminal told the user their link was invalid, which was true of nothing.

So a host resolves a scheme it owns **itself**, through the manifest:

- a matcher's `link` gives the http(s) form, for Open and Copy link;
- a matcher's `open` names an action, for the click.

Neither consults the shell. A page still opens in a browser, because a browser is what `https:` is
for.

## `stith://` — agent sessions

Owned by [stith](https://github.com/aylith-labs/stith). Session ids are `[A-Za-z0-9-]{8,64}`; pane
ids are `[A-Za-z0-9:_-]{2,64}`; rule codes are 1–6 digits with no leading zero.

| Verb | Means |
|---|---|
| `stith://session/<id>` | Open that session on the web. |
| `stith://focus/<id>` | Raise the terminal the session is *running* in. Falls back to `session`. |
| `stith://focus-pane/<paneId>` | Focus one multiplexer pane by its own id. |
| `stith://copy/<id>` | Put the id on the clipboard. Renders nothing. |
| `stith://rule/<code>` | Open agent rule `AR#<code>`. |
| `stith://<id>` | Legacy bare form. Still parsed, no longer emitted. |

Each verb is matched by its own anchored pattern, so a `focus` link is never read as a `session`
one. An unknown verb is **refused**, not read as an id.

## `shefrd://` — multiplexer addresses

Owned by [shefrd](https://github.com/aylith-labs/shefrd). Ids are bijective base-32 over a
Crockford-ish alphabet — `123456789ABCDEFGHJKMNPQRSTVWXYZ0`, with no `I`, `L`, `O` or `U`, and `0`
as the last digit rather than the first.

```
space-id := "w" BASE32                 w1N
tab-id   := space-id ":t" BASE32       w1N:t33
pane-id  := space-id ":p" BASE32       w1N:p39
```

| Verb | Means |
|---|---|
| `shefrd://pane/<pane-id>` | Focus that pane. |
| `shefrd://tab/<tab-id>` | Focus that tab. |
| `shefrd://space/<space-id>` | Focus that space. |

Two properties of the id grammar that matter to anyone writing a pattern for it:

- **`:` is not filesystem-safe.** Anything deriving a filename from an id substitutes `_`.
- **A bare pane id is worth matching directly.** `w1N:p39` appears in output far more often than
  `shefrd://pane/w1N:p39` does, and it is unambiguous enough to match on sight — which is why the
  shefrd manifest carries a text matcher for it and not only a link one.

Routing goes through stith rather than through the multiplexer binary. stith already holds a socket
to every server, so one HTTP call works from Windows, from WSL, and from inside a pane, and a host
does not have to know which of `shefrd` or `herdr` is installed — on a machine where `herdr` is a
symlink to `shefrd`, the name proves nothing anyway. (`HERDR_BIN_PATH` is the discriminator, if you
ever do need to know.)
