<script setup lang="ts">
import {
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuPortal,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from 'reka-ui'
import type { MenuItemDef } from './dropdown-menu-types'

export type { MenuItemDef }

withDefaults(defineProps<{
  items: MenuItemDef[]
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'right' | 'bottom' | 'left'
}>(), {
  align: 'start',
  side: 'bottom',
})
</script>

<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger as-child>
      <slot name="trigger" />
    </DropdownMenuTrigger>

    <DropdownMenuPortal>
      <DropdownMenuContent
        :align="align"
        :side="side"
        :side-offset="6"
        class="tn-popover z-50 min-w-[10rem] rounded-card border border-border
               bg-surface-elevated py-1 shadow-lg focus:outline-none"
      >
        <template v-for="(item, i) in items" :key="i">
          <!-- Separator -->
          <DropdownMenuSeparator
            v-if="item.type === 'separator'"
            class="my-1 h-px bg-border"
          />

          <!-- Label -->
          <DropdownMenuLabel
            v-else-if="item.type === 'label'"
            class="px-3 py-1 text-xs font-medium text-text-muted"
          >
            {{ item.label }}
          </DropdownMenuLabel>

          <!-- Item -->
          <DropdownMenuItem
            v-else
            :disabled="item.disabled"
            class="flex items-center gap-2 px-3 py-1.5 text-sm outline-none cursor-default
                   rounded-sm mx-1 transition-colors
                   data-[highlighted]:bg-surface data-[highlighted]:text-text-primary
                   data-[disabled]:opacity-50 data-[disabled]:pointer-events-none"
            :class="item.danger ? 'text-status-blocked' : 'text-text-secondary'"
            style="transition-duration: var(--motion-duration-fast)"
            @select="item.onSelect()"
          >
            <span v-if="item.icon" aria-hidden="true" class="w-4 h-4 flex-shrink-0">
              {{ item.icon }}
            </span>
            <span class="flex-1">{{ item.label }}</span>
            <span v-if="item.shortcut" class="text-xs text-text-muted font-mono">
              {{ item.shortcut }}
            </span>
          </DropdownMenuItem>
        </template>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
