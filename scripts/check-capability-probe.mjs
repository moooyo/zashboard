#!/usr/bin/env node
// The capability probe must be triggered by something.
//
// initCapabilityDiscovery was complete and correct -- 404, 401, 5xx, timeouts,
// stale responses across a backend switch, all handled -- and nothing ever
// called it. So `states` stayed empty, every feature read as 'unknown',
// featureSupported was permanently false, and renderRoutes and SettingsPage
// filtered the entire 5gpn half of the panel out on every backend. The symptom
// was a panel that connected, showed live traffic, and looked like upstream.
//
// A general "unused export" sweep does NOT catch this, and it is worth saying
// why rather than writing one and believing it: the function was referenced
// twice inside its own file -- the declaration and its own retry timer -- so it
// reads as used by any reference count. It also reports every type and every
// stop* helper in these modules, which are legitimate surface, and a check that
// fails on eighteen things nobody intends to fix is a check that gets skipped.
//
// So this asserts the specific property that broke: the probe has a
// module-level trigger, and that trigger is the backend identity changing.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// fileURLToPath, not URL.pathname: on Windows the latter yields "/D:/..." and
// join() then produces "D:\D:\...".
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const FILE = join(ROOT, 'src', 'assembly', 'fivegpn', 'capabilities.ts')

const body = readFileSync(FILE, 'utf8')
const failures = []

// The trigger must be at module scope. Indented occurrences are inside the
// retry timer or a function, which is how the dead version looked.
if (!/^watch\(/m.test(body)) {
  failures.push('capabilities.ts has no module-level watch; nothing starts the probe')
}
if (!/^\s*activeUuid,\s*$/m.test(body)) {
  failures.push('the probe is not triggered by activeUuid; it would not follow a backend switch')
}
if (!/immediate:\s*true/.test(body)) {
  failures.push('the probe trigger is not immediate; the first load would render no 5gpn surface')
}
// The call has to be the watcher's, not only the retry timer's.
const callSites = (body.match(/initCapabilityDiscovery\(\)/g) || []).length
if (callSites < 2) {
  failures.push(
    `initCapabilityDiscovery() is called ${callSites} time(s); the retry timer alone never fires ` +
      'because nothing schedules a first attempt',
  )
}
if (!/stopCapabilityDiscovery\(\)/.test(body)) {
  failures.push('nothing clears the probe state; a removed backend would leave its conclusions')
}

if (failures.length) {
  console.error('capability probe wiring:')
  for (const f of failures) console.error(`  ${f}`)
  process.exit(1)
}
console.log('ok: the capability probe is triggered at module scope by the active backend')
