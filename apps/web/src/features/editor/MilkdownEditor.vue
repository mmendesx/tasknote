<script setup lang="ts">
/**
 * MilkdownEditor — canonical shared WYSIWYG editor wrapping @milkdown/vue.
 * Plugins: commonmark, gfm, listener, history, clipboard, prism.
 *
 * v-model: string (markdown). Emits 'update:modelValue' on doc change.
 * readOnly prop: disables editing and dims the surface.
 *
 * Authoritative path: apps/web/src/features/editor/MilkdownEditor.vue
 * ICT-19 (TaskDrawer) should import from here; the board/ copy is kept as a
 * re-export shim to avoid breaking ICT-19 if it ran before this move.
 */
import '@milkdown/theme-nord/style.css'
import { defineComponent, h } from 'vue'
import { Milkdown as MilkdownComp, MilkdownProvider, useEditor } from '@milkdown/vue'
import { Editor, rootCtx, defaultValueCtx, editorViewOptionsCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
import { history } from '@milkdown/plugin-history'
import { clipboard } from '@milkdown/plugin-clipboard'

const props = withDefaults(defineProps<{
  modelValue?: string
  readOnly?: boolean
}>(), {
  modelValue: '',
  readOnly: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

// Inner component must be defined inside the setup to close over emit/props.
// MilkdownProvider wraps the component that calls useEditor().
const EditorInner = defineComponent({
  name: 'MilkdownEditorInner',
  props: {
    modelValue: { type: String, default: '' },
    readOnly:   { type: Boolean, default: false },
  },
  emits: ['update:modelValue'],
  setup(innerProps, { emit: innerEmit }) {
    useEditor((root) =>
      Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, root)
          ctx.set(defaultValueCtx, innerProps.modelValue ?? '')
          ctx.update(editorViewOptionsCtx, (prev) => ({
            ...prev,
            editable: () => !innerProps.readOnly,
          }))
          ctx.get(listenerCtx).markdownUpdated((_, md) => {
            innerEmit('update:modelValue', md)
          })
        })
        .use(commonmark)
        .use(gfm)
        .use(listener)
        .use(history)
        .use(clipboard)
    )

    return () => h(MilkdownComp)
  },
})
</script>

<template>
  <div
    class="milkdown-host"
    :class="{ 'milkdown-readonly': readOnly }"
    @click.self="($event.currentTarget as HTMLElement).querySelector<HTMLElement>('.milkdown')?.focus()"
  >
    <MilkdownProvider>
      <EditorInner
        :model-value="modelValue"
        :read-only="readOnly"
        @update:model-value="emit('update:modelValue', $event)"
      />
    </MilkdownProvider>
  </div>
</template>

<!-- Override Milkdown theme-nord CSS vars to match TaskNote design tokens -->
<style>
.milkdown {
  --nord0: var(--color-surface);
  --nord1: var(--color-surface-elevated);
  --nord3: var(--color-border);
  --nord4: var(--color-text-secondary);
  --nord6: var(--color-text-primary);
  --nord8: var(--color-accent);
  --nord10: var(--color-accent);
  background: transparent !important;
  color: var(--color-text-primary) !important;
}
</style>

<style scoped>
.milkdown-host {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  padding: 0.5rem 0.75rem;
  min-height: 8rem;
  cursor: text;
  transition: border-color var(--motion-duration-fast);
}

.milkdown-host:focus-within {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-accent) 30%, transparent);
}

.milkdown-readonly {
  background: var(--color-surface-elevated);
  cursor: default;
}

.milkdown-host :deep(.milkdown) {
  outline: none;
  font-size: 0.875rem;
  color: var(--color-text-primary);
  line-height: 1.6;
  cursor: text;
}

.milkdown-host :deep(.ProseMirror) {
  min-height: 6rem;
  cursor: text;
  outline: none;
}

.milkdown-host :deep(.milkdown p) {
  margin: 0.25rem 0;
}

.milkdown-host :deep(.milkdown h1),
.milkdown-host :deep(.milkdown h2),
.milkdown-host :deep(.milkdown h3) {
  font-weight: 600;
  margin: 0.5rem 0 0.25rem;
}

.milkdown-host :deep(.milkdown code) {
  background: var(--color-surface-elevated);
  border-radius: 3px;
  padding: 0.1em 0.3em;
  font-size: 0.8em;
  font-family: var(--font-mono);
}

.milkdown-host :deep(.milkdown pre) {
  background: var(--color-surface-elevated);
  border-radius: var(--radius-control);
  padding: 0.75rem 1rem;
  overflow-x: auto;
  font-family: var(--font-mono);
  font-size: 0.8em;
}

.milkdown-host :deep(.milkdown ul),
.milkdown-host :deep(.milkdown ol) {
  padding-left: 1.25rem;
  margin: 0.25rem 0;
}

.milkdown-host :deep(.milkdown blockquote) {
  border-left: 2px solid var(--color-accent);
  padding-left: 0.75rem;
  margin: 0.25rem 0;
  color: var(--color-text-secondary);
}

.milkdown-host :deep(.milkdown a) {
  color: var(--color-accent);
  text-decoration: underline;
}
</style>
