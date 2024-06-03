import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'

export function useMediaBreakpoints() {
  const breakpoints = useBreakpoints(breakpointsTailwind)

  const isMobile = computed(() => breakpoints.smaller('md').value)

  return { isMobile }
}
