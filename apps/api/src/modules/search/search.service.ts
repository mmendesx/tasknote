import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskEntity } from '../tasks/entities/task.entity';
import { NoteEntity } from '../notes/entities/note.entity';
import { FileRefEntity } from '../file-refs/entities/file-ref.entity';

const RESULT_CAP = 20;

function escapeLikePattern(raw: string): string {
  return raw.replace(/[%_\\]/g, (ch) => '\\' + ch);
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    @InjectRepository(TaskEntity)
    private readonly tasksRepo: Repository<TaskEntity>,
    @InjectRepository(NoteEntity)
    private readonly notesRepo: Repository<NoteEntity>,
    @InjectRepository(FileRefEntity)
    private readonly fileRefsRepo: Repository<FileRefEntity>,
  ) {}

  async search(q: string) {
    const trimmed = q.trim();

    if (trimmed.length === 0) {
      this.logger.log('search: empty query — returning empty groups without DB round-trip');
      return { tasks: [], notes: [], files: [] };
    }

    const pattern = `%${escapeLikePattern(trimmed)}%`;
    this.logger.log(`search: q="${trimmed}" pattern="${pattern}"`);

    const [tasks, notes, files] = await Promise.all([
      this.searchTasks(pattern),
      this.searchNotes(pattern),
      this.searchFiles(pattern),
    ]);

    this.logger.log(
      `search: found tasks=${tasks.length} notes=${notes.length} files=${files.length}`,
    );

    return { tasks, notes, files };
  }

  private searchTasks(pattern: string): Promise<TaskEntity[]> {
    return this.tasksRepo
      .createQueryBuilder('task')
      .where('task.archived_at IS NULL')
      .andWhere(
        '(task.title LIKE :pattern ESCAPE :esc OR task.description_md LIKE :pattern ESCAPE :esc)',
        { pattern, esc: '\\' },
      )
      .orderBy('task.updated_at', 'DESC')
      .limit(RESULT_CAP)
      .getMany();
  }

  private searchNotes(pattern: string): Promise<NoteEntity[]> {
    return this.notesRepo
      .createQueryBuilder('note')
      .where('note.archived_at IS NULL')
      .andWhere(
        '(note.title LIKE :pattern ESCAPE :esc OR note.body_md LIKE :pattern ESCAPE :esc)',
        { pattern, esc: '\\' },
      )
      .orderBy('note.updated_at', 'DESC')
      .limit(RESULT_CAP)
      .getMany();
  }

  private searchFiles(pattern: string): Promise<FileRefEntity[]> {
    return this.fileRefsRepo
      .createQueryBuilder('file_ref')
      .where('file_ref.label LIKE :pattern ESCAPE :esc', { pattern, esc: '\\' })
      .orderBy('file_ref.created_at', 'DESC')
      .limit(RESULT_CAP)
      .getMany();
  }
}
