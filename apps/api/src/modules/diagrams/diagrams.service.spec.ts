import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { DiagramEntity } from './entities/diagram.entity';
import { DiagramsService } from './diagrams.service';
import type { DiagramScene } from '@tasknote/shared';

const EMPTY_SCENE: DiagramScene = {
  version: 1,
  elements: [],
  appState: { viewport: { scrollX: 0, scrollY: 0, zoom: 1 } },
};

const SAMPLE_SCENE: DiagramScene = {
  version: 1,
  elements: [
    {
      id: 'rect-1',
      type: 'rectangle',
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      stroke: '#000000',
      strokeWidth: 1,
    },
  ],
  appState: { viewport: { scrollX: 0, scrollY: 0, zoom: 1 } },
};

function buildDataSource(): DataSource {
  return new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [DiagramEntity],
    synchronize: true,
    prepareDatabase: (db) => {
      db.pragma('foreign_keys = ON');
    },
  });
}

describe('DiagramsService', () => {
  let dataSource: DataSource;
  let diagramsRepo: Repository<DiagramEntity>;
  let service: DiagramsService;

  beforeEach(async () => {
    dataSource = buildDataSource();
    await dataSource.initialize();

    diagramsRepo = dataSource.getRepository(DiagramEntity);
    service = new DiagramsService(diagramsRepo);
  });

  afterEach(async () => {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  describe('listDiagrams — returns diagrams ordered by recency', () => {
    it('returns all diagrams sorted by updatedAt DESC', async () => {
      const baseTime = new Date('2024-01-01T10:00:00.000Z');
      const tA = new Date(baseTime.getTime() + 3000);
      const tB = new Date(baseTime.getTime() + 1000);
      const tC = new Date(baseTime.getTime() + 2000);

      const diagA = await diagramsRepo.save(
        diagramsRepo.create({ title: 'A', sceneJson: EMPTY_SCENE }),
      );
      const diagB = await diagramsRepo.save(
        diagramsRepo.create({ title: 'B', sceneJson: EMPTY_SCENE }),
      );
      const diagC = await diagramsRepo.save(
        diagramsRepo.create({ title: 'C', sceneJson: EMPTY_SCENE }),
      );

      await diagramsRepo.query(
        `UPDATE diagrams SET updated_at = ? WHERE id = ?`,
        [tA.toISOString(), diagA.id],
      );
      await diagramsRepo.query(
        `UPDATE diagrams SET updated_at = ? WHERE id = ?`,
        [tB.toISOString(), diagB.id],
      );
      await diagramsRepo.query(
        `UPDATE diagrams SET updated_at = ? WHERE id = ?`,
        [tC.toISOString(), diagC.id],
      );

      const diagrams = await service.listDiagrams();

      expect(diagrams).toHaveLength(3);
      expect(diagrams.map((d) => d.title)).toEqual(['A', 'C', 'B']);
    });

    it('returns empty array when no diagrams exist', async () => {
      const diagrams = await service.listDiagrams();
      expect(diagrams).toEqual([]);
    });
  });

  describe('getDiagram — retrieves a single diagram or throws', () => {
    it('returns the diagram by id', async () => {
      const created = await service.createDiagram({ title: 'My Diagram' });
      const found = await service.getDiagram(created.id);
      expect(found.id).toBe(created.id);
      expect(found.title).toBe('My Diagram');
    });

    it('throws NotFoundException when diagram does not exist', async () => {
      await expect(service.getDiagram(9999)).rejects.toThrow(NotFoundException);
    });

    it('NotFoundException message includes the missing id', async () => {
      await expect(service.getDiagram(9999)).rejects.toThrow('Diagram 9999 not found');
    });
  });

  describe('createDiagram — persists title and scene', () => {
    it('persists empty scene when scene_json is not provided', async () => {
      const diagram = await service.createDiagram({ title: 'New Diagram' });
      expect(diagram.sceneJson).toMatchObject(EMPTY_SCENE);
    });

    it('persists the given title', async () => {
      const diagram = await service.createDiagram({ title: 'Architecture Overview' });
      expect(diagram.title).toBe('Architecture Overview');
    });

    it('stores empty string title when title is not provided', async () => {
      const diagram = await service.createDiagram({});
      expect(diagram.title).toBe('');
    });

    it('persists an explicit scene_json when provided', async () => {
      const diagram = await service.createDiagram({ title: 'With Scene', scene_json: SAMPLE_SCENE });
      expect(diagram.sceneJson.elements).toHaveLength(1);
      expect(diagram.sceneJson.elements[0].type).toBe('rectangle');
    });

    it('assigns a numeric id after creation', async () => {
      const diagram = await service.createDiagram({ title: 'Has Id' });
      expect(typeof diagram.id).toBe('number');
      expect(diagram.id).toBeGreaterThan(0);
    });
  });

  describe('updateDiagram — applies partial changes to an existing diagram', () => {
    it('updates the title', async () => {
      const diagram = await service.createDiagram({ title: 'Old Title' });
      const updated = await service.updateDiagram(diagram.id, { title: 'New Title' });
      expect(updated.title).toBe('New Title');
    });

    it('updates the scene_json', async () => {
      const diagram = await service.createDiagram({ title: 'Diagram' });
      const updated = await service.updateDiagram(diagram.id, { scene_json: SAMPLE_SCENE });
      expect(updated.sceneJson.elements).toHaveLength(1);
    });

    it('falls back to "Untitled diagram" when title is empty string', async () => {
      const diagram = await service.createDiagram({ title: 'Had a Title' });
      const updated = await service.updateDiagram(diagram.id, { title: '' });
      expect(updated.title).toBe('Untitled diagram');
    });

    it('falls back to "Untitled diagram" when title is whitespace-only', async () => {
      const diagram = await service.createDiagram({ title: 'Had a Title' });
      const updated = await service.updateDiagram(diagram.id, { title: '   ' });
      expect(updated.title).toBe('Untitled diagram');
    });

    it('preserves existing title when title is not provided in update', async () => {
      const diagram = await service.createDiagram({ title: 'Unchanged', scene_json: EMPTY_SCENE });
      const updated = await service.updateDiagram(diagram.id, { scene_json: SAMPLE_SCENE });
      expect(updated.title).toBe('Unchanged');
    });

    it('preserves existing scene when scene_json is not provided in update', async () => {
      const diagram = await service.createDiagram({ title: 'Keep Scene', scene_json: SAMPLE_SCENE });
      const updated = await service.updateDiagram(diagram.id, { title: 'Updated Title' });
      expect(updated.sceneJson.elements).toHaveLength(1);
    });

    it('throws NotFoundException for unknown diagram id', async () => {
      await expect(
        service.updateDiagram(9999, { title: 'Does not matter' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteDiagram — removes the diagram or throws', () => {
    it('removes the diagram so it no longer exists', async () => {
      const diagram = await service.createDiagram({ title: 'To Be Deleted' });
      await service.deleteDiagram(diagram.id);
      await expect(service.getDiagram(diagram.id)).rejects.toThrow(NotFoundException);
    });

    it('returns void on successful delete', async () => {
      const diagram = await service.createDiagram({ title: 'To Be Deleted' });
      const result = await service.deleteDiagram(diagram.id);
      expect(result).toBeUndefined();
    });

    it('throws NotFoundException when diagram does not exist', async () => {
      await expect(service.deleteDiagram(9999)).rejects.toThrow(NotFoundException);
    });
  });
});
