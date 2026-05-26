import { Injectable, Logger } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { BoardEntity } from '../boards/entities/board.entity';
import { ColumnEntity } from '../columns/entities/column.entity';
import { TaskEntity } from '../tasks/entities/task.entity';
import { NoteEntity } from '../notes/entities/note.entity';

export interface SampleBoardResult {
  boardId: number;
}

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  async createSampleBoard(manager: EntityManager): Promise<SampleBoardResult> {
    this.logger.log('Creating sample board with default columns and tasks');

    const board = manager.create(BoardEntity, {
      name: 'My Tasks',
      position: 0,
    });
    const savedBoard = await manager.save(BoardEntity, board);

    const columnDefs: Array<Partial<ColumnEntity>> = [
      { name: 'Backlog', color: '#5B616B', isDone: false, position: 0, boardId: savedBoard.id },
      { name: 'Doing',   color: '#5B616B', isDone: false, position: 1, boardId: savedBoard.id },
      { name: 'Blocked', color: '#5B616B', isDone: false, position: 2, boardId: savedBoard.id },
      { name: 'Done',    color: '#A3E635', isDone: true,  position: 3, boardId: savedBoard.id },
    ];

    const columns = columnDefs.map((def) => manager.create(ColumnEntity, def));
    const savedColumns = await manager.save(ColumnEntity, columns);

    const backlogColumn = savedColumns.find((c) => c.position === 0);
    if (!backlogColumn) {
      throw new Error('Seed failed: backlog column not found after save');
    }

    const taskDefs: Array<Partial<TaskEntity>> = [
      { title: 'Review pull requests',   priority: 'medium', position: 0, columnId: backlogColumn.id },
      { title: 'Prep standup notes',     priority: 'high',   position: 1, columnId: backlogColumn.id },
      { title: 'Reply to Slack threads', priority: 'low',    position: 2, columnId: backlogColumn.id },
    ];

    const tasks = taskDefs.map((def) => manager.create(TaskEntity, def));
    const savedTasks = await manager.save(TaskEntity, tasks);

    const firstTask = savedTasks.find((t) => t.position === 0);
    if (!firstTask) {
      throw new Error('Seed failed: first task not found after save');
    }

    const note = manager.create(NoteEntity, {
      title: 'Welcome to TaskNote',
      bodyMd: [
        '# Welcome to TaskNote',
        '',
        'TaskNote is your personal kanban + notes workspace. Everything lives locally — no cloud, no accounts.',
        '',
        'A few things you can do right away:',
        '',
        '- **Move tasks** between columns by dragging cards',
        '- **Open a task** to add notes, file references, and due dates',
        '- **Press `n`** in any column to quickly add a task',
        '- **Press `?`** anywhere to see all keyboard shortcuts',
        '',
        'This note is linked to the "Review pull requests" task as an example.',
      ].join('\n'),
      pinned: false,
      taskId: firstTask.id,
    });

    await manager.save(NoteEntity, note);

    this.logger.log(
      `Sample board created: boardId=${savedBoard.id}, columns=${savedColumns.length}, tasks=${savedTasks.length}`,
    );

    return { boardId: savedBoard.id };
  }
}
