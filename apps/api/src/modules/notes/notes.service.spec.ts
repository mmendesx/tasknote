
import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { NoteEntity } from './entities/note.entity';
import { TaskEntity } from '../tasks/entities/task.entity';
import { ColumnEntity } from '../columns/entities/column.entity';
import { BoardEntity } from '../boards/entities/board.entity';
import { TagEntity } from '../tags/entities/tag.entity';
import { NotesService, deriveTitle } from './notes.service';

function buildDataSource(): DataSource {
  return new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [NoteEntity, TaskEntity, ColumnEntity, BoardEntity, TagEntity],
    synchronize: true,
    prepareDatabase: (db) => {
      db.pragma('foreign_keys = ON');
    },
  });
}

async function insertNote(
  repo: Repository<NoteEntity>,
  overrides: Partial<NoteEntity>,
): Promise<NoteEntity> {
  const note = repo.create({
    title: 'Default',
    bodyMd: '',
    pinned: false,
    ...overrides,
  });
  return repo.save(note);
}

describe('deriveTitle', () => {
  it('strips h1 heading marker and returns trimmed text', () => {
    expect(deriveTitle('# Standup 5/23')).toBe('Standup 5/23');
  });

  it('strips h2 through h6 heading markers', () => {
    expect(deriveTitle('## Section')).toBe('Section');
    expect(deriveTitle('### Sub')).toBe('Sub');
    expect(deriveTitle('###### Deep')).toBe('Deep');
  });

  it('uses the first non-empty line', () => {
    expect(deriveTitle('\n\n## My note\nSome content')).toBe('My note');
  });

  it('returns plain text from a non-heading first line', () => {
    expect(deriveTitle('Just a sentence')).toBe('Just a sentence');
  });

  it('truncates to 80 characters', () => {
    const long = 'A'.repeat(100);
    expect(deriveTitle(long)).toHaveLength(80);
  });

  it('returns empty string for blank body', () => {
    expect(deriveTitle('')).toBe('');
    expect(deriveTitle('   \n  \n  ')).toBe('');
  });

  it('does not strip inline # characters', () => {
    expect(deriveTitle('Color is #fff')).toBe('Color is #fff');
  });
});

describe('NotesService', () => {
  let dataSource: DataSource;
  let notesRepo: Repository<NoteEntity>;
  let tasksRepo: Repository<TaskEntity>;
  let columnsRepo: Repository<ColumnEntity>;
  let boardsRepo: Repository<BoardEntity>;
  let service: NotesService;

  beforeEach(async () => {
    dataSource = buildDataSource();
    await dataSource.initialize();

    notesRepo = dataSource.getRepository(NoteEntity);
    tasksRepo = dataSource.getRepository(TaskEntity);
    columnsRepo = dataSource.getRepository(ColumnEntity);
    boardsRepo = dataSource.getRepository(BoardEntity);

    service = new NotesService(notesRepo, tasksRepo);
  });

  afterEach(async () => {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  async function createTask(): Promise<TaskEntity> {
    const board = await boardsRepo.save(boardsRepo.create({ name: 'Board', position: 0 }));
    const column = await columnsRepo.save(
      columnsRepo.create({ boardId: board.id, name: 'Doing', color: '#fff', position: 0 }),
    );
    return tasksRepo.save(
      tasksRepo.create({ columnId: column.id, title: 'Task T', position: 0 }),
    );
  }

  describe('createNote — BDD: Create standalone note', () => {
    it('derives title from body when title is absent', async () => {
      const note = await service.createNote({ body_md: '# Standup 5/23\nSome content' });
      expect(note.title).toBe('Standup 5/23');
    });

    it('derives title from body when title is empty string', async () => {
      const note = await service.createNote({ title: '', body_md: '# Meeting notes' });
      expect(note.title).toBe('Meeting notes');
    });

    it('uses explicit non-empty title as-is', async () => {
      const note = await service.createNote({ title: 'My Custom Title', body_md: '# Body Heading' });
      expect(note.title).toBe('My Custom Title');
    });

    it('preserves an explicit title longer than 80 chars (not truncated)', async () => {
      const longTitle = 'A'.repeat(150);
      const note = await service.createNote({ title: longTitle, body_md: '# Body heading' });
      expect(note.title).toHaveLength(150);
    });

    it('persists body_md unchanged', async () => {
      const body = '# Standup 5/23\nDid: shipped feature\nWill: review PR';
      const note = await service.createNote({ body_md: body });
      expect(note.bodyMd).toBe(body);
    });

    it('defaults pinned to false when not provided', async () => {
      const note = await service.createNote({ body_md: 'Content' });
      expect(note.pinned).toBe(false);
    });

    it('throws NotFoundException when task_id does not exist', async () => {
      await expect(
        service.createNote({ task_id: 9999, body_md: 'Content' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listNotes — BDD: Pinned notes appear first', () => {
    it('returns pinned notes before unpinned notes', async () => {
      
      const baseTime = new Date('2024-01-01T10:00:00.000Z');
      const tA = new Date(baseTime.getTime() + 2000); 
      const tB = new Date(baseTime.getTime() + 3000); 
      const tC = new Date(baseTime.getTime() + 1000); 

      const noteA = await notesRepo.save(
        notesRepo.create({ title: 'A', bodyMd: '', pinned: true }),
      );
      const noteB = await notesRepo.save(
        notesRepo.create({ title: 'B', bodyMd: '', pinned: false }),
      );
      const noteC = await notesRepo.save(
        notesRepo.create({ title: 'C', bodyMd: '', pinned: true }),
      );

      await notesRepo.query(
        `UPDATE notes SET updated_at = ? WHERE id = ?`,
        [tA.toISOString(), noteA.id],
      );
      await notesRepo.query(
        `UPDATE notes SET updated_at = ? WHERE id = ?`,
        [tB.toISOString(), noteB.id],
      );
      await notesRepo.query(
        `UPDATE notes SET updated_at = ? WHERE id = ?`,
        [tC.toISOString(), noteC.id],
      );

      const notes = await service.listNotes();

      expect(notes).toHaveLength(3);
      const titles = notes.map((n) => n.title);
      
      expect(titles).toEqual(['A', 'C', 'B']);
    });

    it('excludes archived notes', async () => {
      await insertNote(notesRepo, { title: 'Active', bodyMd: '' });
      await insertNote(notesRepo, { title: 'Archived', bodyMd: '', archivedAt: new Date() });

      const notes = await service.listNotes();
      expect(notes).toHaveLength(1);
      expect(notes[0].title).toBe('Active');
    });

    it('returns empty array when no active notes exist', async () => {
      const notes = await service.listNotes();
      expect(notes).toEqual([]);
    });
  });

  describe('listNotes — task_id filter', () => {
    it('returns only notes linked to the given task', async () => {
      const task = await createTask();

      await service.createNote({ task_id: task.id, body_md: 'Linked note' });
      await service.createNote({ body_md: 'Standalone note' });

      const linked = await service.listNotes(task.id);
      expect(linked).toHaveLength(1);
      expect(linked[0].bodyMd).toBe('Linked note');
    });

    it('returns all active notes when task_id is not provided', async () => {
      const task = await createTask();

      await service.createNote({ task_id: task.id, body_md: 'Note 1' });
      await service.createNote({ body_md: 'Note 2' });

      const all = await service.listNotes();
      expect(all).toHaveLength(2);
    });
  });

  describe('getNote', () => {
    it('returns the note by id', async () => {
      const created = await service.createNote({ body_md: 'Some body' });
      const found = await service.getNote(created.id);
      expect(found.id).toBe(created.id);
    });

    it('throws NotFoundException when note does not exist', async () => {
      await expect(service.getNote(9999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateNote — BDD: Link a note to a task', () => {
    it('persists task_id when linking note to task', async () => {
      const task = await createTask();
      const note = await service.createNote({ body_md: 'Standalone' });

      const updated = await service.updateNote(note.id, { task_id: task.id });

      expect(updated.taskId).toBe(task.id);
    });

    it('clears task_id when passing null', async () => {
      const task = await createTask();
      const note = await service.createNote({ task_id: task.id, body_md: 'Linked' });

      const updated = await service.updateNote(note.id, { task_id: null });
      expect(updated.taskId).toBeNull();
    });

    it('throws NotFoundException when linking to non-existent task', async () => {
      const note = await service.createNote({ body_md: 'Standalone' });
      await expect(service.updateNote(note.id, { task_id: 9999 })).rejects.toThrow(NotFoundException);
    });

    it('re-derives title when body changes and title is omitted', async () => {
      const note = await service.createNote({ title: 'Old title', body_md: 'Old content' });
      const updated = await service.updateNote(note.id, { body_md: '# New heading\nMore text' });
      expect(updated.title).toBe('New heading');
    });

    it('re-derives title when title is explicitly set to empty string', async () => {
      const note = await service.createNote({ title: 'Old title', body_md: '# Body heading' });
      const updated = await service.updateNote(note.id, { title: '' });
      expect(updated.title).toBe('Body heading');
    });

    it('keeps existing title when only body changes and title is provided', async () => {
      const note = await service.createNote({ title: 'Keep me', body_md: 'Old body' });
      const updated = await service.updateNote(note.id, {
        title: 'Keep me',
        body_md: '# Irrelevant heading',
      });
      expect(updated.title).toBe('Keep me');
    });

    it('throws NotFoundException for unknown note id', async () => {
      await expect(service.updateNote(9999, { body_md: 'New body' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('softDeleteNote + restoreNote — soft delete + restore cycle', () => {
    it('sets archived_at on delete', async () => {
      const note = await service.createNote({ body_md: 'Will be archived' });
      await service.softDeleteNote(note.id);

      const archived = await notesRepo.findOne({ where: { id: note.id } });
      expect(archived!.archivedAt).not.toBeNull();
    });

    it('excludes archived note from list after soft delete', async () => {
      const note = await service.createNote({ body_md: 'Content' });
      await service.softDeleteNote(note.id);

      const notes = await service.listNotes();
      expect(notes.find((n) => n.id === note.id)).toBeUndefined();
    });

    it('clears archived_at on restore', async () => {
      const note = await service.createNote({ body_md: 'Content' });
      await service.softDeleteNote(note.id);
      const restored = await service.restoreNote(note.id);

      expect(restored.archivedAt).toBeNull();
    });

    it('restored note appears in list again', async () => {
      const note = await service.createNote({ body_md: 'Content' });
      await service.softDeleteNote(note.id);
      await service.restoreNote(note.id);

      const notes = await service.listNotes();
      expect(notes.find((n) => n.id === note.id)).toBeDefined();
    });

    it('restore is idempotent when note is not archived', async () => {
      const note = await service.createNote({ body_md: 'Content' });
      
      const restored = await service.restoreNote(note.id);
      expect(restored.archivedAt).toBeNull();
    });

    it('softDelete throws NotFoundException for unknown note', async () => {
      await expect(service.softDeleteNote(9999)).rejects.toThrow(NotFoundException);
    });

    it('restore throws NotFoundException for unknown note', async () => {
      await expect(service.restoreNote(9999)).rejects.toThrow(NotFoundException);
    });
  });
});
