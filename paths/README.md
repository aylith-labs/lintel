# Path recognition and WSL resolution

The patterns recognize absolute drive paths, UNC paths and POSIX paths in text.
They are bounded by whitespace or surrounding markup. Hosts should prefer explicit
OSC 8 / Markdown links over detected paths, and run detection with their regex
budget. Paths are data, never shell command text.

`pathResolution.ts` and `PathResolution.h` implement the same pure policy:

1. Keep explicit Windows drive and UNC paths unchanged, even inside WSL.
2. On Windows, `/mnt/<drive>/...` resolves to that drive.
3. A POSIX path belongs to the producing WSL distribution when known.
4. If the source distribution is unknown, probe registered distributions
   asynchronously and accept only a unique existing candidate. Do not guess when
   two distributions contain the path. Show the ambiguity rather than silently
   opening one. Do not start a shell to resolve a hover.
5. Linux/macOS POSIX paths remain local paths. Parse file URI fragments and
   percent escapes before applying this policy; never percent-decode bare paths.

Hosts provide distribution names from their registry/session context and perform
bounded filesystem checks off the UI thread. The pure module does no filesystem,
process or registry I/O. A `Z:\...` mapped drive stays a Windows path regardless of
what backs the mapping.

Synchronize consumers and verify their committed copies:

```sh
npm run sync:paths -- --terminal /path/to/terminal --torbie /path/to/torbie
npm run sync:paths -- --check --terminal /path/to/terminal --torbie /path/to/torbie
npm test
```

The host caps the number of registered distributions it probes; operating-system filesystem
calls may still take time on an unavailable share. They must not block the UI thread.
