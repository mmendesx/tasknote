// Domain constants — imported by entities, dtos, and consumers

export const PRIORITY_VALUES = ['low', 'medium', 'high', 'urgent'] as const;
export const THEME_VALUES = ['dark', 'light'] as const;
export const TARGET_TYPE_VALUES = ['task', 'note'] as const;
export const SEED_VALUES = ['empty', 'sample'] as const;

export const MAX_TITLE_LENGTH = 200;

// Matches ; & | ` $ ( ) newline — used in path validation
export const FORBIDDEN_PATH_CHARS = /[;&|`$()\n]/;

// Matches POSIX absolute path (starts with /) or Windows drive path (e.g. C:\ or C:/)
export const ABSOLUTE_PATH_PATTERN = /^(?:\/|[A-Za-z]:[\\/])/;
