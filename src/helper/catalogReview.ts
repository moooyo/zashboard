import type { FiveGPNCandidate, FiveGPNSettingValue } from '@/api/fivegpn'

/**
 * Build an update request from the opaque URL returned by review.
 *
 * The candidate's manifest source can be the final redirect URL, while review
 * returns the catalog entry URL that apply must quote. Reconstructing the value
 * from the candidate breaks the review/apply fence and causes a valid reviewed
 * update to conflict.
 */
export const catalogUpdateBody = (
  revision: string,
  candidate: FiveGPNCandidate,
  reviewedURL: string,
  values?: Record<string, FiveGPNSettingValue>,
) => {
  if (!reviewedURL) throw new Error('reviewed catalog URL is required')
  return { revision, digest: candidate.digest, url: reviewedURL, values }
}
