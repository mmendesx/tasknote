import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { CreateDiagramDto, DiagramScene, UpdateDiagramDto } from '@tasknote/shared';
import { DiagramEntity } from './entities/diagram.entity';

const EMPTY_SCENE: DiagramScene = {
  version: 1,
  elements: [],
  appState: { viewport: { scrollX: 0, scrollY: 0, zoom: 1 } },
};

function resolveTitle(title?: string): string {
  const trimmed = (title ?? '').trim();
  return trimmed === '' ? 'Untitled diagram' : trimmed;
}

@Injectable()
export class DiagramsService {
  private readonly logger = new Logger(DiagramsService.name);

  constructor(
    @InjectRepository(DiagramEntity)
    private readonly diagramsRepo: Repository<DiagramEntity>,
  ) {}

  async listDiagrams(): Promise<DiagramEntity[]> {
    this.logger.log('listDiagrams: fetching all diagrams ordered by updatedAt DESC');

    return this.diagramsRepo
      .createQueryBuilder('diagram')
      .orderBy('diagram.updated_at', 'DESC')
      .getMany();
  }

  async getDiagram(id: number): Promise<DiagramEntity> {
    this.logger.log(`getDiagram: loading diagram id=${id}`);

    const diagram = await this.diagramsRepo.findOne({ where: { id } });
    if (!diagram) {
      this.logger.warn(`getDiagram: diagram id=${id} not found`);
      throw new NotFoundException(`Diagram ${id} not found`);
    }

    return diagram;
  }

  async createDiagram(dto: CreateDiagramDto): Promise<DiagramEntity> {
    const title = resolveTitle(dto.title);
    this.logger.log(`createDiagram: creating diagram title="${title}"`);

    const diagram = this.diagramsRepo.create({
      title,
      sceneJson: dto.scene_json ?? EMPTY_SCENE,
    });

    const saved = await this.diagramsRepo.save(diagram);
    this.logger.log(`createDiagram: created diagram id=${saved.id} title="${saved.title}"`);
    return saved;
  }

  async updateDiagram(id: number, dto: UpdateDiagramDto): Promise<DiagramEntity> {
    this.logger.log(`updateDiagram: updating diagram id=${id}`);

    const diagram = await this.getDiagram(id);

    if (dto.title !== undefined) {
      diagram.title = resolveTitle(dto.title);
    }

    if (dto.scene_json !== undefined) {
      diagram.sceneJson = dto.scene_json;
    }

    const updated = await this.diagramsRepo.save(diagram);
    this.logger.log(`updateDiagram: diagram id=${id} updated title="${updated.title}"`);
    return updated;
  }

  async deleteDiagram(id: number): Promise<void> {
    this.logger.log(`deleteDiagram: deleting diagram id=${id}`);

    const diagram = await this.getDiagram(id);
    await this.diagramsRepo.remove(diagram);
    this.logger.log(`deleteDiagram: diagram id=${id} deleted`);
  }
}
