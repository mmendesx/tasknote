// @tasknote/ui — Vue component primitives and design tokens

// ─── Components ───────────────────────────────────────────────────
export { default as Button }       from './components/Button.vue'
export { default as IconButton }   from './components/IconButton.vue'
export { default as Input }        from './components/Input.vue'
export { default as Textarea }     from './components/Textarea.vue'
export { default as Dialog }       from './components/Dialog.vue'
export { default as Drawer }       from './components/Drawer.vue'
export { default as DropdownMenu } from './components/DropdownMenu.vue'
export { default as Tooltip }      from './components/Tooltip.vue'
export { default as Toast }        from './components/Toast.vue'
export { default as Tag }          from './components/Tag.vue'
export { default as Chip }         from './components/Chip.vue'
export { default as Kbd }          from './components/Kbd.vue'

// ─── Composables ──────────────────────────────────────────────────
export { useToast }                from './components/useToast'
export type { ToastItem, ToastVariant } from './components/useToast'

// ─── Shared types ─────────────────────────────────────────────────
export type { MenuItemDef }        from './components/dropdown-menu-types'

// ─── Asset paths (resolved by Vite at build time) ─────────────────
export const LOGO_MARK_URL     = new URL('./assets/logo-mark.svg',     import.meta.url).href
export const LOGO_WORDMARK_URL = new URL('./assets/logo-wordmark.svg', import.meta.url).href
export const FAVICON_URL       = new URL('./assets/favicon.svg',       import.meta.url).href

// ─── CSS entry points (import in host app) ────────────────────────
// import '@tasknote/ui/style.css'         → design tokens (CSS vars)
// import '@tasknote/ui/animations.css'    → tn-* animation utilities
