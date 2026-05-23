export type MenuItemDef =
  | {
      type: 'item'
      label: string
      icon?: string
      shortcut?: string
      disabled?: boolean
      danger?: boolean
      onSelect: () => void
    }
  | {
      type: 'separator'
    }
  | {
      type: 'label'
      label: string
    }
