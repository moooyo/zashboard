import { installSetupHandoffCapture } from './setupHandoff'

// This module must run before vue-router reads location and creates its first
// history state. The setup secret then never enters route.fullPath or state.current.
// A link opened in an existing tab or installed PWA is a same-document hash
// navigation. These listeners are registered before vue-router's listener, so
// they remove credentials before the router can snapshot the new route.
installSetupHandoffCapture()
