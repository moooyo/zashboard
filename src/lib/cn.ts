import { extendTailwindMerge } from 'tailwind-merge'

const typeScale = ['caption', 'label', 'body-sm', 'body', 'title-sm', 'title', 'display']
const radiusScale = ['xs', 'sm', 'md', 'lg', 'xl']
const controlScale = ['control-xs', 'control-sm', 'control-md', 'control-lg', 'control-xl']

/**
 * Merge Tailwind classes without misclassifying named design tokens.
 *
 * tailwind-merge otherwise treats an unknown `text-*` token as a colour and
 * can remove a real text colour when a named type step is present.
 */
export const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      radius: radiusScale,
      spacing: controlScale,
      text: typeScale,
    },
  },
})

export const cn = twMerge
