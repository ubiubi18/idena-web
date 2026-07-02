import {useBreakpointValue} from '@chakra-ui/react'

export function useIsDesktop() {
  return useBreakpointValue([false, true])
}
