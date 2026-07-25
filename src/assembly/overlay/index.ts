// assembly 门面。视图只从这里取 overlay 状态,不直接 import api/*。
export type { OverlayReadback } from '@/api/overlay'
export {
  initOverlayDiscovery,
  overlayError,
  overlayOwner,
  overlayReadback,
  overlaySchemaVersion,
  overlayState,
  overlaySupported,
  refreshOverlayReadback,
  stopOverlayDiscovery,
} from './discovery'
export type { FeatureState } from './discovery'
