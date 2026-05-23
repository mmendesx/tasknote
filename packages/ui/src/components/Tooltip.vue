<script setup lang="ts">
import {
  TooltipRoot,
  TooltipTrigger,
  TooltipPortal,
  TooltipContent,
  TooltipArrow,
  TooltipProvider,
} from 'reka-ui'

withDefaults(defineProps<{
  content: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  delayDuration?: number
}>(), {
  side: 'top',
  delayDuration: 400,
})
</script>

<template>
  <TooltipProvider :delay-duration="delayDuration">
    <TooltipRoot>
      <TooltipTrigger as-child>
        <slot />
      </TooltipTrigger>

      <TooltipPortal>
        <TooltipContent
          :side="side"
          :side-offset="6"
          class="tn-popover z-50 rounded-control border border-border
                 bg-surface-elevated px-2.5 py-1
                 text-xs text-text-primary shadow-md focus:outline-none"
        >
          {{ content }}
          <TooltipArrow class="fill-surface-elevated" />
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>
