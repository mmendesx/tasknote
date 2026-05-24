import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { CreateNoteDto, UpdateNoteDto } from '@tasknote/shared';
import { NoteEntity } from './entities/note.entity';
import { TaskEntity } from '../tasks/entities/task.entity';

const MAX_DERIVED_TITLE_LENGTH = 80;

/**
 * Derives a title from the first non-empty line of a markdown body.
 * Strips leading heading markers (# through ######) and surrounding whitespace.
 * Returns '' when the body is blank or all lines are empty.
 */
export function deriveTitle(body: string): string {
  const lines = body.split('\n');

  for (const line of lines) {
    const stripped = line.replace(/^#{1,6}\s+/, '').trim();
    if (stripped.length > 0) {
      return stripped.slice(0, MAX_DERIVED_TITLE_LENGTH);
    }
  }

  return '';
}

@Injectable()
export class NotesService {
  private readonly logger = new Logger(NotesService.name);

  constructor(
    @InjectRepository(NoteEntity)
    private readonly notesRepo: Repository<NoteEntity>,
    @InjectRepository(TaskEntity)
    private readonly tasksRepo: Repository<TaskEntity>,
  ) {}

  async listArchived(): Promise<NoteEntity[]> {
    this.logger.log('listArchived: fetching archived notes');

    return this.notesRepo
      .createQueryBuilder('note')
      .where('note.archived_at IS NOT NULL')
      .orderBy('note.archived_at', 'DESC')
      .getMany();
  }

  async listNotes(taskId?: number): Promise<NoteEntity[]> {
    this.logger.log(
      `listNotes: fetching active notes${taskId !== undefined ? ` for task_id=${taskId}` : ''}`,
    );

    const qb = this.notesRepo
      .createQueryBuilder('note')
      .where('note.archived_at IS NULL')
      .orderBy('note.pinned', 'DESC')
      .addOrderBy('note.updated_at', 'DESC');

    if (taskId !== undefined) {
      qb.andWhere('note.task_id = :taskId', { taskId });
    }

    return qb.getMany();
  }

  async getNote(id: number): Promise<NoteEntity> {
    this.logger.log(`getNote: loading note id=${id}`);

    const note = await this.notesRepo.findOne({ where: { id } });
    if (!note) {
      this.logger.warn(`getNote: note id=${id} not found`);
      throw new NotFoundException(`Note with id '${id}' not found`);
    }

    return note;
  }

  async createNote(dto: CreateNoteDto): Promise<NoteEntity> {
    this.logger.log(
      `createNote: creating note task_id=${dto.task_id ?? null} title="${dto.title ?? ''}"`,
    );

    if (dto.task_id != null) {
      const task = await this.tasksRepo.findOne({ where: { id: dto.task_id } });
      if (!task) {
        this.logger.warn(`createNote: task id=${dto.task_id} not found`);
        throw new NotFoundException(`Task with id '${dto.task_id}' not found`);
      }
    }

    const resolvedTitle = resolveTitle(dto.title, dto.body_md);

    const note = this.notesRepo.create({
      taskId: dto.task_id ?? null,
      title: resolvedTitle,
      bodyMd: dto.body_md,
      pinned: dto.pinned ?? false,
    });

    const saved = await this.notesRepo.save(note);
    this.logger.log(`createNote: created note id=${saved.id} title="${saved.title}"`);
    return saved;
  }

  async updateNote(id: number, dto: UpdateNoteDto): Promise<NoteEntity> {
    this.logger.log(`updateNote: updating note id=${id}`);

    const note = await this.notesRepo.findOne({ where: { id } });
    if (!note) {
      this.logger.warn(`updateNote: note id=${id} not found`);
      throw new NotFoundException(`Note with id '${id}' not found`);
    }

    if (dto.task_id !== undefined) {
      if (dto.task_id != null) {
        const task = await this.tasksRepo.findOne({ where: { id: dto.task_id } });
        if (!task) {
          this.logger.warn(`updateNote: task id=${dto.task_id} not found`);
          throw new NotFoundException(`Task with id '${dto.task_id}' not found`);
        }
      }
      note.taskId = dto.task_id ?? null;
    }

    if (dto.body_md !== undefined) {
      note.bodyMd = dto.body_md;
    }

    if (dto.pinned !== undefined) {
      note.pinned = dto.pinned;
    }

    // Title resolution:
    //   - explicit non-empty title → use it directly
    //   - title === '' or title omitted but body changed → re-derive from updated body
    //   - title omitted and body unchanged → keep existing title
    if (dto.title !== undefined && dto.title !== '') {
      note.title = dto.title;
    } else if (dto.title === '' || (dto.title === undefined && dto.body_md !== undefined)) {
      note.title = deriveTitle(note.bodyMd);
    }

    const updated = await this.notesRepo.save(note);
    this.logger.log(`updateNote: note id=${id} updated title="${updated.title}"`);
    return updated;
  }

  async softDeleteNote(id: number): Promise<void> {
    this.logger.log(`softDeleteNote: archiving note id=${id}`);

    const note = await this.notesRepo.findOne({ where: { id } });
    if (!note) {
      this.logger.warn(`softDeleteNote: note id=${id} not found`);
      throw new NotFoundException(`Note with id '${id}' not found`);
    }

    note.archivedAt = new Date();
    await this.notesRepo.save(note);
    this.logger.log(`softDeleteNote: note id=${id} archived`);
  }

  async restoreNote(id: number): Promise<NoteEntity> {
    this.logger.log(`restoreNote: restoring note id=${id}`);

    const note = await this.notesRepo.findOne({ where: { id } });
    if (!note) {
      this.logger.warn(`restoreNote: note id=${id} not found`);
      throw new NotFoundException(`Note with id '${id}' not found`);
    }

    note.archivedAt = null;
    const restored = await this.notesRepo.save(note);
    this.logger.log(`restoreNote: note id=${id} restored`);
    return restored;
  }

  async permanentDeleteNote(id: number): Promise<void> {
    this.logger.log(`permanentDeleteNote: attempting hard delete note id=${id}`);

    const note = await this.notesRepo.findOne({ where: { id } });
    if (!note) {
      this.logger.warn(`permanentDeleteNote: note id=${id} not found`);
      throw new NotFoundException(`Note with id '${id}' not found`);
    }

    if (!note.archivedAt) {
      this.logger.warn(
        `permanentDeleteNote: note id=${id} is not archived — cannot permanently delete`,
      );
      throw new ConflictException({
        code: 'NOT_ARCHIVED',
        message: 'Note must be archived before permanent deletion',
      });
    }

    await this.notesRepo.remove(note);
    this.logger.log(`permanentDeleteNote: note id=${id} hard deleted`);
  }
}

// ─── Private helpers ──────────────────────────────────────────────────────────

/**
 * Picks a final title for create operations:
 *   - explicit non-empty title → use it
 *   - blank/absent title → derive from body
 */
function resolveTitle(title: string | undefined, body: string): string {
  if (title !== undefined && title.trim().length > 0) {
    // Explicit titles are bounded by the Zod schema (MAX_TITLE_LENGTH = 200).
    // Only derived titles are truncated to 80 chars.
    return title.trim();
  }
  return deriveTitle(body);
}
