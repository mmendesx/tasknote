import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { DiagramEntity } from './entities/diagram.entity';
import { DiagramsService } from './diagrams.service';
import type { DiagramScene } from '@tasknote/shared';
import { UpdateDiagramDtoSchema } from '@tasknote/shared';

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

    it('stores "Untitled diagram" when title is not provided', async () => {
      const diagram = await service.createDiagram({});
      expect(diagram.title).toBe('Untitled diagram');
    });

    it('stores "Untitled diagram" when title is whitespace-only', async () => {
      const diagram = await service.createDiagram({ title: '   ' });
      expect(diagram.title).toBe('Untitled diagram');
    });

    it('stores the title trimmed when a non-empty title is provided', async () => {
      const diagram = await service.createDiagram({ title: '  Auth flow  ' });
      expect(diagram.title).toBe('Auth flow');
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

    it('viewport-only update merges into the stored scene without touching elements', async () => {
      const diagram = await service.createDiagram({ title: 'Pan Me', scene_json: SAMPLE_SCENE });
      const updated = await service.updateDiagram(diagram.id, {
        viewport: { scrollX: 120, scrollY: -40, zoom: 2 },
      });
      expect(updated.sceneJson.appState.viewport).toEqual({ scrollX: 120, scrollY: -40, zoom: 2 });
      expect(updated.sceneJson.elements).toHaveLength(1);
      expect(updated.sceneJson.elements[0]!.id).toBe('rect-1');
    });

    it('viewport is ignored when scene_json is also present (scene carries its own viewport)', async () => {
      const diagram = await service.createDiagram({ title: 'Both', scene_json: EMPTY_SCENE });
      const updated = await service.updateDiagram(diagram.id, {
        scene_json: SAMPLE_SCENE,
        viewport: { scrollX: 999, scrollY: 999, zoom: 9 },
      });
      expect(updated.sceneJson.appState.viewport).toEqual(SAMPLE_SCENE.appState.viewport);
    });

    it('UpdateDiagramDtoSchema accepts a viewport-only payload', () => {
      const result = UpdateDiagramDtoSchema.safeParse({
        viewport: { scrollX: 1, scrollY: 2, zoom: 0.5 },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('DiagramSceneSchema — rejects scenes that exceed size caps', () => {
    const BASE_VIEWPORT = { scrollX: 0, scrollY: 0, zoom: 1 };

    function buildRectElement(id: string) {
      return {
        id,
        type: 'rectangle' as const,
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        stroke: '#000',
        strokeWidth: 1,
      };
    }

    it('rejects scene_json with 1,001 elements (exceeds 1,000-element cap)', () => {
      const elements = Array.from({ length: 1001 }, (_, i) => buildRectElement(`r-${i}`));
      const result = UpdateDiagramDtoSchema.safeParse({
        scene_json: { version: 1, elements, appState: { viewport: BASE_VIEWPORT } },
      });
      expect(result.success).toBe(false);
      expect(JSON.stringify(result.error?.issues)).toContain('1,000 elements');
    });

    it('accepts scene_json with exactly 1,000 elements (boundary)', () => {
      const elements = Array.from({ length: 1000 }, (_, i) => buildRectElement(`r-${i}`));
      const result = UpdateDiagramDtoSchema.safeParse({
        scene_json: { version: 1, elements, appState: { viewport: BASE_VIEWPORT } },
      });
      expect(result.success).toBe(true);
    });

    it('rejects a pen element with 2,001 points (exceeds 2,000-point cap)', () => {
      const points = Array.from({ length: 2001 }, (_, i) => [i, i] as [number, number]);
      const result = UpdateDiagramDtoSchema.safeParse({
        scene_json: {
          version: 1,
          elements: [{ id: 'p-1', type: 'pen', points, stroke: '#000', strokeWidth: 1 }],
          appState: { viewport: BASE_VIEWPORT },
        },
      });
      expect(result.success).toBe(false);
      expect(JSON.stringify(result.error?.issues)).toContain('2,000 points');
    });

    it('accepts a pen element with exactly 2,000 points (boundary)', () => {
      const points = Array.from({ length: 2000 }, (_, i) => [i, i] as [number, number]);
      const result = UpdateDiagramDtoSchema.safeParse({
        scene_json: {
          version: 1,
          elements: [{ id: 'p-1', type: 'pen', points, stroke: '#000', strokeWidth: 1 }],
          appState: { viewport: BASE_VIEWPORT },
        },
      });
      expect(result.success).toBe(true);
    });

    it('rejects a text element with 1,001 characters (exceeds 1,000-char cap)', () => {
      const result = UpdateDiagramDtoSchema.safeParse({
        scene_json: {
          version: 1,
          elements: [
            {
              id: 't-1',
              type: 'text',
              x: 0,
              y: 0,
              text: 'a'.repeat(1001),
              fontSize: 14,
              color: '#000',
            },
          ],
          appState: { viewport: BASE_VIEWPORT },
        },
      });
      expect(result.success).toBe(false);
      expect(JSON.stringify(result.error?.issues)).toContain('1,000 characters');
    });

    it('accepts a text element with exactly 1,000 characters (boundary)', () => {
      const result = UpdateDiagramDtoSchema.safeParse({
        scene_json: {
          version: 1,
          elements: [
            {
              id: 't-1',
              type: 'text',
              x: 0,
              y: 0,
              text: 'a'.repeat(1000),
              fontSize: 14,
              color: '#000',
            },
          ],
          appState: { viewport: BASE_VIEWPORT },
        },
      });
      expect(result.success).toBe(true);
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
