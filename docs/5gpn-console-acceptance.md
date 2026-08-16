# 5gpn Console acceptance

This runbook owns the browser-facing acceptance boundary for the 5gpn build of
Zashboard. It is intentionally separate from gateway deployment smoke tests,
mihomo runtime acceptance, installer recovery tests, and filesystem attack
injection. A Console run must not stop or kill mihomo, replace host files, alter
systemd state, or exercise certificate-key ownership attacks.

Run it against a disposable or explicitly designated current-schema gateway.
The checklist makes small controller mutations and restores them. Do not run it
while another operator is editing DNS or extension state.

## Release and evidence identity

Use a released `dist.zip` selected by an exact 5gpn installer pin. Do not build
from a branch, use a development server, or download assets from a mutable
branch. Record these values before testing:

- Zashboard release tag, asset SHA-256, and displayed commit ID.
- Mihomo version and binary SHA-256.
- 5gpn release tag that selected both component pins.
- Browser name and version, OS, certificate mode, and test date.
- Desktop and mobile screenshots named with the release tag and viewport.

The full run requires this exact controller contract:

| Surface | Required value | Console behavior on any other value |
| --- | --- | --- |
| `controllerApi` | string `"1"` | Hide 5gpn management surfaces. |
| `5gpn-dns` | version `2` | Hide DNS and Setup Guide routes. |
| `5gpn-interception` | version `7` | Hide Extensions, Hosts, Marketplace, and Plugin Logs routes. |
| `5gpn-bot` | version `1`, optional | Show bot settings only when advertised. |

Fetch `/capabilities` through the same authenticated origin the browser uses.
The response must carry `Cache-Control: no-store`, and the exact-version check
must pass before continuing:

```bash
CONSOLE='console.example.com'
SECRET='read-from-the-designated-test-gateway'

auth_curl() {
  # fd 3 is opened anew for this curl invocation and closes on return. Curl's
  # argv contains only the descriptor path, while fd 0 remains available for
  # callers that stream a request body with --data-binary @-.
  curl --disable --proto '=https' --noproxy '*' \
    -H "@/proc/self/fd/3" "$@" \
    3<<<"Authorization: Bearer ${SECRET}"
}

auth_curl --fail --silent --show-error \
  -D capabilities.headers \
  "https://${CONSOLE}/capabilities" > capabilities.json

jq -e '
  .controllerApi == "1" and
  .features["5gpn-dns"].version == 2 and
  .features["5gpn-interception"].version == 7 and
  ((.features["5gpn-bot"] | not) or .features["5gpn-bot"].version == 1)
' capabilities.json
grep -iEq '^cache-control:.*no-store' capabilities.headers
```

Do not export `SECRET` or enable shell tracing. Never include the controller
secret in screenshots, command output, HAR files, browser history, or the final
evidence archive. Every authenticated example below uses `auth_curl`; do not
replace its descriptor-backed header with a literal `-H "Authorization: ..."`
argument.

## Fixed acceptance data

This repository owns two test fixtures:

| Fixture | LF byte size | SHA-256 |
| --- | ---: | --- |
| [`fixtures/console-acceptance-extension.yaml`](fixtures/console-acceptance-extension.yaml) | 984 | `4e8949892c81525c9d25fbbe67e8e2e86c38e481d4d94669f40af7d08413b92b` |
| [`fixtures/marketplace-v2-e5c550c.json`](fixtures/marketplace-v2-e5c550c.json) | 4218 | `ca1f8e3f9115661893e40c7c42577f3f7f61c573d85f57a2058e101f58a568ff` |

Serve the marketplace fixture unchanged from a controlled HTTPS fixture origin
that the gateway is allowed to fetch. Verify the served bytes before adding the
source in the Console:

```bash
FIXTURE_URL='https://fixtures.example.com/marketplace-v2-e5c550c.json'
curl --fail --silent --show-error "${FIXTURE_URL}" -o marketplace.json
printf '%s  %s\n' \
  'ca1f8e3f9115661893e40c7c42577f3f7f61c573d85f57a2058e101f58a568ff' \
  marketplace.json | sha256sum --check --strict
```

The marketplace snapshot contains three entries from extension revision
`e5c550c46e819a06e078751ee9a245dda07bcbe7`. Every manifest URL names that
40-character revision and every manifest has an explicit digest and size. Do
not replace the fixture with the current GitHub Pages document, a raw `main`
URL, or another branch tip. If any fixed URL or digest is unavailable, report
the acceptance as blocked instead of silently selecting newer data.

The synthetic extension is local-add data. Upload its exact bytes or paste the
exact LF-normalized content. It has no network grant, no persistent storage,
one capture host, one action, and a deterministic 204 response. Its only
purpose is to exercise review layout and the in-memory plugin log view.

## Environment preparation

Use a clean browser profile and a gateway with no pre-existing instance of
`io.5gpn.console-acceptance`. For the extension and PWA sections, also require:

- a client that can reach the installation-managed gateway address;
- the private interception CA trusted by the test client;
- an HTTPS Console certificate trusted without a browser exception for the PWA
  section; and
- enough authority to remove the acceptance extension and marketplace source.

Capture the initial controller state without editing host files:

```bash
auth_curl --fail --silent --show-error \
  "https://${CONSOLE}/5gpn/dns" > dns.before.json
auth_curl --fail --silent --show-error \
  "https://${CONSOLE}/5gpn/interception" > interception.before.json

jq -S '.document' dns.before.json > dns.document.before.json
jq -S '{enabled: .snapshot.enabled, http2: .snapshot.http2,
        modules: .snapshot.modules, catalog_sources: .snapshot.catalog_sources}' \
  interception.before.json > interception.operator.before.json
```

Require the acceptance extension ID to be absent. Record whether the MITM
master was initially enabled. If unrelated installed extensions or marketplace
sources exist, use a different designated gateway instead of assuming cleanup
can overwrite them.

## Viewport matrix

Run the page and interaction checks at all four viewports. Keep browser zoom at
100 percent.

| Name | CSS viewport | Purpose |
| --- | --- | --- |
| Desktop | `1440 x 900` | Full sidebar, tables, and desktop dialogs. |
| Boundary mobile | `767 x 900` | Last width using the mobile page layout. |
| Boundary desktop | `768 x 900` | First width using the desktop page layout. |
| Phone | `390 x 844` | Drawer navigation, cards, sheets, and soft-keyboard pressure. |

At every width, require no document-level horizontal scroll, no clipped primary
action, no content hidden behind the top bar, and no text below the 11 px
caption step. Controls that step down must do so at 768 px, not at 640 px.

## 1. Public bootstrap and credential handoff

- [ ] `https://$CONSOLE/ui` redirects to `/ui/`, and `/ui/` loads without an
      Authorization header.
- [ ] A valid `#/setup?...&secret=...` link scrubs the complete fragment query
      with `history.replaceState` before the first controller probe is visible.
- [ ] A successful setup stores the secret in `sessionStorage` for the current
      tab. It does not enter persistent browser storage until the operator uses
      **Remember controller secret**.
- [ ] Invalid setup data, a failed probe, an outer `/ui/?secret=...` query, and
      a secret on a route other than `/setup` are scrubbed and do not create a
      backend.
- [ ] Opening the valid handoff in an installed PWA or an existing tab follows
      the same scrub-before-router behavior.
- [ ] The Setup Guide derives `dot.<base>`, shows Android instructions, and
      links directly to both public iOS profiles. Neither profile URL nor its
      downloaded bytes contain the controller secret.

## 2. Capability-owned pages and navigation

With the required capability response, verify these are distinct top-level
routes and navigation entries:

- [ ] `/5gpn-dns` and `/5gpn-setup-guide` are present only for DNS v2.
- [ ] `/extensions`, `/extensions/hosts`, `/marketplace`, and `/plugin-logs`
      are present only for interception v7.
- [ ] `/extensions` contains installed-extension management and a Hosts audit
      entry point, but no embedded Marketplace tab or decorative traffic rail.
- [ ] `/marketplace` owns discovery, while `/plugin-logs` is in the Plugin
      navigation group. DNS policy rules remain in Parse.
- [ ] Switching to a backend that lacks a required capability immediately
      leaves the now-invalid route and shows no stale controls.
- [ ] Loading and temporarily unavailable states use persistent page surfaces;
      controls are not rendered against `undefined`, and retry remains visible
      after a transient capability failure.

At the phone viewport, open and close the drawer from every 5gpn route. Focus
must return to the trigger, the current route must remain visible, and the
drawer must not change page width.

## 3. DNS gateway ownership and whole-document save

Record the baseline gateway and revision:

```bash
BASE_GATEWAY="$(jq -r '.document.gateway' dns.before.json)"
BASE_REVISION="$(jq -r '.revision' dns.before.json)"
test -n "${BASE_GATEWAY}" && test -n "${BASE_REVISION}"
```

- [ ] The DNS settings page renders the gateway as text, not as an `input`,
      `select`, `textarea`, or any element bound with `v-model`.
- [ ] The adjacent persistent hint says the address is installation-managed
      and directs the operator to `sudo 5gpn configure` on the gateway host.
- [ ] Change only the fallback selector to another value. The sticky saved/live
      surface reports a draft, and one explicit Save publishes the complete
      document.
- [ ] In the browser Network panel, the PUT payload contains the exact baseline
      gateway. The successful response and a fresh GET retain the same gateway.
- [ ] Restore the baseline fallback through the same whole-document save. The
      final canonical `.document` equals `dns.document.before.json`; only the
      revision may have advanced.
- [ ] Create a stale edit in a second tab, save the first tab, then save the
      second. The second tab keeps its draft and shows a persistent conflict
      surface with an explicit discard-and-reload action.

As a non-mutating companion check, submit a revision-correct document whose
only difference is a different gateway. DNS v2 must reject it with HTTP 400,
and a following GET must retain both the original revision and gateway. This
proves the Console's read-only presentation agrees with the core boundary; it
does not replace mihomo's persistence tests.

## 4. Marketplace interaction

Add the served fixed snapshot with source ID `io.5gpn.acceptance` and local
display name `Acceptance snapshot`.

- [ ] The source chip shows both the local display name and the source ID. The
      alias is not presented as publisher identity.
- [ ] Exactly Apple WLOC, Bilibili Cleaner, and TestFlight Region Unlock appear.
- [ ] Search for `location`, `media`, and `region`; each query returns only the
      matching truthful entry fields. Clearing search restores all three.
- [ ] Exercise catalog, name, ID, and version sort. The UI does not invent
      popularity, author, health, download, or update-date metadata.
- [ ] Refresh retains one complete snapshot. A controlled HTTP failure from the
      same fixture endpoint preserves the prior entries and fetched time while
      displaying the source error.
- [ ] Review Apple WLOC. The cached entry summary is followed by the actual
      digest-verified manifest review, and the review identifies immutable
      revision `e5c550c46e819a06e078751ee9a245dda07bcbe7` resources.
- [ ] Cancel review without installing. No installed-extension revision changes,
      and the installed page exposes no check-update action.

Do not use the public mutable Marketplace pointer for this section. Remove the
acceptance source during cleanup.

## 5. Extension review and Plugin Logs

Use local add with `fixtures/console-acceptance-extension.yaml`.

- [ ] The desktop review lists the exact capture host, action, body mode,
      timeout, digest, absence of network and persistent-storage grants, and
      `DIRECT` operator egress. It does not render raw JSON as the primary review.
- [ ] At 390 px and 767 px, the review is a bottom sheet bounded by the visual
      viewport. The footer actions remain reachable with the soft keyboard open,
      long capture/action values wrap, and focus returns to the add trigger on
      cancel.
- [ ] Install starts disabled with `DIRECT`; enable requires one review. If the
      master was initially off, enable it only for this fixture and record that
      it must be restored.
- [ ] While the fixture is installed, attempting to add the same ID through
      pasted URL or local review is refused and leaves the installed snapshot
      unchanged.
- [ ] Wait for the fixture runtime to become ready before generating traffic.
      `certificate_pending` or an error is not an acceptable active state.

Generate one event set from a client. `GATEWAY` is the installation-managed
address shown on the DNS page:

```bash
GATEWAY='192.0.2.10'
curl --fail --silent --show-error \
  --resolve "console-acceptance.example:443:${GATEWAY}" \
  -D fixture-response.headers -o /dev/null \
  'https://console-acceptance.example/console-acceptance'
grep -Eq '^HTTP/[^ ]+ 204' fixture-response.headers
grep -iEq '^x-console-acceptance: *1' fixture-response.headers
```

- [ ] `/plugin-logs` shows the fixture's log, info, warning, and error messages
      plus action completion metadata. Script console text does not appear in
      persistent gateway journal output.
- [ ] Extension, level, and debounced text filters converge without overlapping
      requests. Only one row is expanded at a time.
- [ ] On desktop the filters are inline. On phone they live in a bottom sheet;
      applied values return as chips, and rows use the single-column card form.
- [ ] Pause freezes the visible snapshot while the gateway's bounded ring keeps
      ingesting. Generate another event set and require the persistent paused
      text and retained-event count to increase. Resume exposes the retained
      events.
- [ ] Clear changes only the browser watermark, does not ask for confirmation,
      and offers Undo. Undo restores still-retained events.
- [ ] The log surface fills its one bounded viewport region. Page chrome does
      not create nested full-page scrollbars at any required viewport.

## 6. Ordinary mihomo logs

Open `/logs`, pause the live view, and generate several harmless authenticated
controller reads from another client.

- [ ] The paused label says that display updates are paused and reports the
      buffered count; it does not imply the gateway stopped logging.
- [ ] Resume renders the buffered entries instead of discarding them.
- [ ] Search, level, source, and text controls remain usable on desktop and in
      the mobile layout, and the shared log chrome has the same height policy as
      Plugin Logs.

Restart/reset behavior belongs to mihomo runtime acceptance. Do not restart the
gateway merely to exercise a Console stream-reset banner in this run.

## 7. PWA and cache boundary

Run this section only with a browser-trusted production Console certificate. A
debug self-signed certificate may render the page after an exception, but the
browser correctly refuses service-worker registration; record that as an
environmental skip, not a PWA pass.

- [ ] `manifest.webmanifest` is linked from `/ui/`, has relative scope and
      start URL, declares standalone display, and references present icons.
- [ ] The browser offers installation and the installed app opens under `/ui/`
      with the same setup-fragment scrubbing and session credential rules.
- [ ] The worker has no precache entries. `/ui/*` navigation is NetworkOnly with
      `cache: no-store`; fonts and management responses are not available from a
      service-worker cache.
- [ ] Seed a cache with a unique acceptance name, then activate the current
      worker. Activation deletes the old cache and reloads controlled windows.
- [ ] Take the gateway offline and reload. No stale Console control plane is
      rendered as usable. Restore connectivity and reload; the live release
      returns without clearing the saved backend metadata.
- [ ] No UI action checks GitHub for a mihomo or Zashboard self-upgrade.

## 8. Theme and interaction sweep

Repeat the DNS, Marketplace, review-sheet, and both log surfaces in all five
shipped themes, starting from `light`.

- [ ] Theme controls exist only in the top-bar profile menu and Settings
      appearance.
- [ ] Categorical peers remain distinguishable with chart colors; state colors
      are not used as entity identity.
- [ ] Keyboard Tab/Shift+Tab reaches every interactive control in visual order.
      Escape closes dialogs and sheets, browser Back closes a modal history
      entry before leaving its page, and focus returns to the opener.
- [ ] Disabled controls have persistent explanatory text rather than a
      tooltip-only reason. Loading cards show a skeleton instead of controls
      bound to absent data.

## Cleanup and pass criteria

Remove `io.5gpn.console-acceptance`, remove source
`io.5gpn.acceptance`, and restore the MITM master if this run changed it. Fetch
fresh state and compare operator-owned projections:

```bash
auth_curl --fail --silent --show-error \
  "https://${CONSOLE}/5gpn/dns" > dns.after.json
auth_curl --fail --silent --show-error \
  "https://${CONSOLE}/5gpn/interception" > interception.after.json

jq -S '.document' dns.after.json > dns.document.after.json
jq -S '{enabled: .snapshot.enabled, http2: .snapshot.http2,
        modules: .snapshot.modules, catalog_sources: .snapshot.catalog_sources}' \
  interception.after.json > interception.operator.after.json

cmp dns.document.before.json dns.document.after.json
cmp interception.operator.before.json interception.operator.after.json
```

The run passes only when every applicable checkbox passes, cleanup comparisons
are byte-identical, and every skip has an explicit environmental reason. Keep
the exact capability response, component identities, fixture hashes, viewport
screenshots, and a redacted network trace with the result. Do not keep secrets
or decrypted plugin traffic in the evidence archive.
