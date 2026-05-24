/**
 * smoke.spec.ts
 *
 * End-to-end smoke test for TaskNote.
 *
 * BDD scenarios exercised:
 *   - "First launch shows onboarding overlay"      (step 1 visible)
 *   - "Completing onboarding with sample seed"     (steps 2+3, Finish)
 *   - "Create task via quick-add"                  (quick-add input, Enter)
 *   - "Search finds matches across types"          (cmd+K, type "smoke")
 *   - Notes view navigation                        (/notes)
 *   - Settings navigation                          (/settings)
 */

import { test, expect } from '@playwright/test';

// ─── Onboarding → board ───────────────────────────────────────────────────────

test('full onboarding smoke: complete onboarding with sample board, create task, search, navigate', async ({
  page,
}) => {
  // ── 1. Navigate to the app ────────────────────────────────────────────────
  await page.goto('/');

  // ── 2. Onboarding overlay is visible on first load ────────────────────────
  // The Dialog renders with role="dialog"; it wraps the whole overlay.
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // Step 1 (Welcome) should be shown — look for the "Next" or "Get Started" CTA
  // StepWelcome emits @next on its button click; advance to step 2.
  const nextBtn = dialog.getByRole('button', { name: /next|get started/i });
  await expect(nextBtn).toBeVisible();
  await nextBtn.click();

  // ── 3. Step 2: Fill display name "Test User", leave timezone default ───────
  // Wait for the name input (label "Your name")
  const nameInput = dialog.getByLabel('Your name');
  await expect(nameInput).toBeVisible();
  await nameInput.fill('Test User');

  // Click Next to advance to step 3
  const nextBtnStep2 = dialog.getByRole('button', { name: /^next$/i });
  await expect(nextBtnStep2).toBeEnabled();
  await nextBtnStep2.click();

  // ── 4. Step 3: Select "Create sample board", click Finish ─────────────────
  // The seed radio button for "Create sample board"
  const sampleRadio = dialog.getByRole('radio', { name: /create sample board/i });
  await expect(sampleRadio).toBeVisible();
  await sampleRadio.click();
  // Verify it is selected
  await expect(sampleRadio).toHaveAttribute('aria-checked', 'true');

  const finishBtn = dialog.getByRole('button', { name: /finish/i });
  await expect(finishBtn).toBeEnabled();
  await finishBtn.click();

  // ── 5. Board view loads — dialog closes and board heading is visible ───────
  await expect(dialog).not.toBeVisible({ timeout: 10_000 });

  // The BoardView renders an h1 with text "Board"
  const boardHeading = page.getByRole('heading', { level: 1 });
  await expect(boardHeading).toBeVisible({ timeout: 10_000 });

  // ── 6. Create a new task via quick-add ────────────────────────────────────
  // The "Add task" button in each column footer (aria-label="Add task to this column")
  // activates the inline QuickAddTaskInput (ICT-18 + ICT-20 integration).
  // Click the button in the first column to open quick-add.
  const addTaskBtn = page.getByRole('button', { name: /add task to this column/i }).first();
  await expect(addTaskBtn).toBeVisible({ timeout: 5_000 });
  await addTaskBtn.click();

  // QuickAddTaskInput appears — type the task title and press Enter
  const quickAddInput = page.getByPlaceholder('Task title…');
  await expect(quickAddInput).toBeVisible({ timeout: 5_000 });
  await quickAddInput.fill('Smoke test task');
  await quickAddInput.press('Enter');

  // Task card should appear in the board
  const taskCard = page.getByText('Smoke test task');
  await expect(taskCard).toBeVisible({ timeout: 5_000 });

  // ── 7. Open command palette (cmd+K) and search ────────────────────────────
  await page.keyboard.press('Meta+k');

  // Command palette should be visible
  const palette = page.getByRole('dialog', { name: /command palette/i });
  await expect(palette).toBeVisible({ timeout: 5_000 });

  // Type "smoke" in the search input
  const searchInput = palette.getByRole('textbox');
  await searchInput.fill('smoke');

  // Wait for results — "Smoke test task" should appear in task results
  const searchResult = palette.getByText('Smoke test task');
  await expect(searchResult).toBeVisible({ timeout: 5_000 });

  // Close palette with Escape
  await page.keyboard.press('Escape');
  await expect(palette).not.toBeVisible();

  // ── 8. Navigate to /notes ─────────────────────────────────────────────────
  await page.goto('/notes');

  // NotesView renders an h1 with text "Notes"
  const notesHeading = page.getByRole('heading', { name: /^notes$/i });
  await expect(notesHeading).toBeVisible({ timeout: 5_000 });

  // ── 9. Navigate to /settings ──────────────────────────────────────────────
  await page.goto('/settings');

  // SettingsView renders an h1 with text "Settings"
  const settingsHeading = page.getByRole('heading', { name: /^settings$/i });
  await expect(settingsHeading).toBeVisible({ timeout: 5_000 });
});
