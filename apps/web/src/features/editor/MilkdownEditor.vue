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
import { defineComponent, h, ref, onMounted, onUnmounted, Teleport } from 'vue'
import { Milkdown as MilkdownComp, MilkdownProvider, useEditor, useInstance } from '@milkdown/vue'
import { Editor, rootCtx, defaultValueCtx, editorViewOptionsCtx, commandsCtx, editorViewCtx } from '@milkdown/core'
import { commonmark, toggleStrongCommand, toggleEmphasisCommand, toggleInlineCodeCommand } from '@milkdown/preset-commonmark'
import { gfm, toggleStrikethroughCommand } from '@milkdown/preset-gfm'
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

// ─── Inner component — has access to Milkdown context ─────────────────────────
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

    // ─── Floating toolbar state ────────────────────────────────────────────
    const [, getInstance] = useInstance()

    const toolbarVisible = ref(false)
    const toolbarX      = ref(0)
    const toolbarY      = ref(0)
    const activeMarks   = ref({ bold: false, italic: false, strike: false, code: false })

    function runCommand(cmd: { key: string }) {
      const editor = getInstance()
      if (!editor) return
      editor.action((ctx) => {
        ctx.get(commandsCtx).call(cmd.key)
      })
      // Re-check marks after toggle
      requestAnimationFrame(updateActiveMarks)
    }

    function updateActiveMarks() {
      const editor = getInstance()
      if (!editor) return
      try {
        editor.action((ctx) => {
          const view  = ctx.get(editorViewCtx)
          const state = view.state
          const { from, to, empty } = state.selection
          if (empty) { activeMarks.value = { bold: false, italic: false, strike: false, code: false }; return }

          const schema = state.schema
          const strongMark  = schema.marks['strong']
          const emMark      = schema.marks['emphasis']
          const strikeMark  = schema.marks['strike_through']
          const codeMark    = schema.marks['code']

          activeMarks.value = {
            bold:   strongMark ? state.doc.rangeHasMark(from, to, strongMark)   : false,
            italic: emMark     ? state.doc.rangeHasMark(from, to, emMark)       : false,
            strike: strikeMark ? state.doc.rangeHasMark(from, to, strikeMark)   : false,
            code:   codeMark   ? state.doc.rangeHasMark(from, to, codeMark)     : false,
          }
        })
      } catch {
        // editor not ready yet
      }
    }

    function onSelectionChange() {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        toolbarVisible.value = false
        return
      }

      const range    = sel.getRangeAt(0)
      const anchorEl = sel.anchorNode?.parentElement

      // Only show toolbar when selection is inside a ProseMirror editor
      if (!anchorEl?.closest('.ProseMirror')) {
        toolbarVisible.value = false
        return
      }

      const rect = range.getBoundingClientRect()
      if (rect.width === 0) { toolbarVisible.value = false; return }

      // Position: centred above selection, 8px gap
      toolbarX.value = rect.left + rect.width / 2
      toolbarY.value = rect.top - 8
      toolbarVisible.value = true
      updateActiveMarks()
    }

    onMounted(() => {
      document.addEventListener('selectionchange', onSelectionChange)
    })
    onUnmounted(() => {
      document.removeEventListener('selectionchange', onSelectionChange)
    })

    return () => [
      h(MilkdownComp),
      h(Teleport, { to: 'body' },
        toolbarVisible.value && !innerProps.readOnly
          ? [h('div', {
              class: 'milkdown-toolbar',
              style: {
                position: 'fixed',
                left:    `${toolbarX.value}px`,
                top:     `${toolbarY.value}px`,
                transform: 'translate(-50%, -100%)',
                zIndex: 9999,
              },
              onMousedown: (e: MouseEvent) => e.preventDefault(), // keep selection
            }, [
              h('button', {
                type: 'button',
                class: ['milkdown-toolbar__btn', { 'milkdown-toolbar__btn--active': activeMarks.value.bold }],
                title: 'Bold (Ctrl+B)',
                onMousedown: (e: MouseEvent) => { e.preventDefault(); runCommand(toggleStrongCommand) },
              }, h('strong', 'B')),
              h('button', {
                type: 'button',
                class: ['milkdown-toolbar__btn', { 'milkdown-toolbar__btn--active': activeMarks.value.italic }],
                title: 'Italic (Ctrl+I)',
                onMousedown: (e: MouseEvent) => { e.preventDefault(); runCommand(toggleEmphasisCommand) },
              }, h('em', 'I')),
              h('button', {
                type: 'button',
                class: ['milkdown-toolbar__btn', { 'milkdown-toolbar__btn--active': activeMarks.value.strike }],
                title: 'Strikethrough',
                onMousedown: (e: MouseEvent) => { e.preventDefault(); runCommand(toggleStrikethroughCommand) },
              }, h('s', 'S')),
              h('button', {
                type: 'button',
                class: ['milkdown-toolbar__btn', { 'milkdown-toolbar__btn--active': activeMarks.value.code }],
                title: 'Inline code',
                onMousedown: (e: MouseEvent) => { e.preventDefault(); runCommand(toggleInlineCodeCommand) },
              }, h('code', '</>'))
            ])]
          : []
      )
    ]
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

/* ─── Floating selection toolbar ─────────────────────────────────────────── */
.milkdown-toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 6px;
  background: var(--color-text-primary, #1a1a1a);
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  pointer-events: auto;
  white-space: nowrap;
}

.milkdown-toolbar__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  padding: 0 6px;
  border-radius: 4px;
  background: transparent;
  color: var(--color-bg, #fff);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.1s;
  border: none;
}

.milkdown-toolbar__btn:hover {
  background: rgba(255, 255, 255, 0.15);
}

.milkdown-toolbar__btn--active {
  background: var(--color-accent, #6c6ef5);
  color: #fff;
}

.milkdown-toolbar__btn code {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
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
