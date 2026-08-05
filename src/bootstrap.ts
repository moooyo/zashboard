import './helper/setupHandoffBootstrap'

// A dynamic boundary guarantees credential scrubbing and navigation capture
// are installed before any application or vue-router module is evaluated.
void import('./main')
