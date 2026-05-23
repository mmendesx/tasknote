import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as childProcess from 'child_process';
import * as fs from 'fs/promises';
import type { CreateFileRefDto, UpdateFileRefDto } from '@tasknote/shared';
import { ABSOLUTE_PATH_PATTERN, FORBIDDEN_PATH_CHARS, TARGET_TYPE_VALUES } from '@tasknote/shared';
import { FileRefEntity } from './entities/file-ref.entity';

// Maps Node.js process.platform to the OS "open file" binary.
// spawn is called without `shell: true` — each value is a bare executable name.
const PLATFORM_OPENER: Record<string, string> = {
  darwin: 'open',
  linux: 'xdg-open',
  win32: 'explorer.exe',
};

@Injectable()
export class FileRefsService {
  private readonly logger = new Logger(FileRefsService.name);

  constructor(
    @InjectRepository(FileRefEntity)
    private readonly fileRefsRepo: Repository<FileRefEntity>,
  ) {}

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Defense-in-depth path validation. The Zod DTO already rejects bad paths at
   * the HTTP boundary, but this re-checks at the service layer so that any
   * caller bypassing the controller (e.g., tests, internal calls) still gets
   * the same security guarantee.
   *
   * Throws 400 INVALID_PATH if:
   *   - path is not absolute (POSIX / or Windows C:\)
   *   - path contains shell metacharacters (; & | ` $ ( ) newline)
   */
  validatePath(path: string): void {
    if (!ABSOLUTE_PATH_PATTERN.test(path)) {
      this.logger.warn(`validatePath: rejected non-absolute path="${path}"`);
      throw new BadRequestException({
        code: 'INVALID_PATH',
        message: 'Path must be absolute (start with / or a Windows drive letter)',
      });
    }

    if (FORBIDDEN_PATH_CHARS.test(path)) {
      this.logger.warn(`validatePath: rejected path with shell metacharacters path="${path}"`);
      throw new BadRequestException({
        code: 'INVALID_PATH',
        message: 'Path must not contain shell metacharacters (; & | ` $ ( ) or newline)',
      });
    }
  }

  /**
   * Returns the platform-specific binary name for opening a file with its
   * default OS application.
   *
   * Throws if the current platform is unsupported rather than silently
   * falling through to an unsafe fallback.
   */
  getPlatformOpener(): string {
    const opener = PLATFORM_OPENER[process.platform];
    if (!opener) {
      throw new BadRequestException({
        code: 'UNSUPPORTED_PLATFORM',
        message: `Opening files is not supported on platform '${process.platform}'`,
      });
    }
    return opener;
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  async listFileRefs(targetType: string, targetId: number): Promise<FileRefEntity[]> {
    // Validate that target_type is a known value — guards against omitted query param
    // (NestJS passes undefined when the param is missing, and TypeORM would silently
    // drop the condition, returning refs across all target types).
    if (!targetType || !(TARGET_TYPE_VALUES as readonly string[]).includes(targetType)) {
      this.logger.warn(
        `listFileRefs: rejected invalid target_type="${targetType}"`,
      );
      throw new BadRequestException({
        code: 'INVALID_TARGET_TYPE',
        message: `target_type is required and must be one of: ${TARGET_TYPE_VALUES.join(', ')}`,
      });
    }

    this.logger.log(
      `listFileRefs: fetching refs for target_type="${targetType}" target_id=${targetId}`,
    );
    return this.fileRefsRepo.find({
      where: { targetType, targetId },
      order: { createdAt: 'ASC' },
    });
  }

  async createFileRef(dto: CreateFileRefDto): Promise<FileRefEntity> {
    this.logger.log(
      `createFileRef: creating ref target_type="${dto.target_type}" target_id=${dto.target_id} path="${dto.path}"`,
    );

    // Defense-in-depth — Zod already validated at controller boundary
    this.validatePath(dto.path);

    const entity = this.fileRefsRepo.create({
      targetType: dto.target_type,
      targetId: dto.target_id,
      path: dto.path,
      label: dto.label,
      note: dto.note ?? null,
    });

    const saved = await this.fileRefsRepo.save(entity);
    this.logger.log(`createFileRef: created id=${saved.id}`);
    return saved;
  }

  async updateFileRef(id: number, dto: UpdateFileRefDto): Promise<FileRefEntity> {
    this.logger.log(`updateFileRef: updating id=${id}`);

    const ref = await this.fileRefsRepo.findOne({ where: { id } });
    if (!ref) {
      this.logger.warn(`updateFileRef: id=${id} not found`);
      throw new NotFoundException(`File reference with id '${id}' not found`);
    }

    // Re-validate if the caller is changing the path — defense-in-depth
    if (dto.path !== undefined) {
      this.validatePath(dto.path);
    }

    Object.assign(ref, {
      ...(dto.path !== undefined && { path: dto.path }),
      ...(dto.label !== undefined && { label: dto.label }),
      ...(dto.note !== undefined && { note: dto.note }),
    });

    const updated = await this.fileRefsRepo.save(ref);
    this.logger.log(`updateFileRef: id=${id} updated`);
    return updated;
  }

  async removeFileRef(id: number): Promise<void> {
    this.logger.log(`removeFileRef: deleting id=${id}`);

    const result = await this.fileRefsRepo.delete(id);
    if (result.affected === 0) {
      this.logger.warn(`removeFileRef: id=${id} not found`);
      throw new NotFoundException(`File reference with id '${id}' not found`);
    }

    this.logger.log(`removeFileRef: id=${id} deleted`);
  }

  // ─── Filesystem checks ────────────────────────────────────────────────────

  async exists(id: number): Promise<{ exists: boolean }> {
    this.logger.log(`exists: checking filesystem for id=${id}`);

    const ref = await this.fileRefsRepo.findOne({ where: { id } });
    if (!ref) {
      this.logger.warn(`exists: id=${id} not found`);
      throw new NotFoundException(`File reference with id '${id}' not found`);
    }

    try {
      await fs.stat(ref.path);
      this.logger.log(`exists: id=${id} path="${ref.path}" → true`);
      return { exists: true };
    } catch {
      this.logger.log(`exists: id=${id} path="${ref.path}" → false (stat failed)`);
      return { exists: false };
    }
  }

  // ─── OS open ─────────────────────────────────────────────────────────────

  async openFile(id: number): Promise<{ opened: true }> {
    this.logger.log(`openFile: opening id=${id}`);

    const ref = await this.fileRefsRepo.findOne({ where: { id } });
    if (!ref) {
      this.logger.warn(`openFile: id=${id} not found`);
      throw new NotFoundException(`File reference with id '${id}' not found`);
    }

    // Re-validate path as defense-in-depth before handing to the OS
    this.validatePath(ref.path);

    const opener = this.getPlatformOpener();

    // Security: spawn is called WITHOUT `shell: true` (default is false).
    // The path is a separate argv element — never string-concatenated.
    // detached + unref: the child process is fully independent; the parent
    // does not block or wait for it to exit.
    // stdio 'ignore': we don't consume or log any output from the subprocess.
    const child = childProcess.spawn(opener, [ref.path], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();

    this.logger.log(
      `openFile: id=${id} spawned opener="${opener}" path="${ref.path}" (detached, no shell)`,
    );

    return { opened: true };
  }
}
