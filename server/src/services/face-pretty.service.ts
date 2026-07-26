import { BadRequestException, Injectable } from '@nestjs/common';
import path from 'node:path';
import sharp from 'sharp';
import { AuthDto } from 'src/dtos/auth.dto';
import { FacePrettyDto, FacePrettyResponseDto } from 'src/dtos/face-pretty.dto';
import {
  AssetType,
  ChecksumAlgorithm,
  JobName,
  Permission,
} from 'src/enum';
import { BaseService } from 'src/services/base.service';
import { facePretty, type VolcengineCredentials } from 'src/utils/volcengine';

/** The Volcengine FacePretty API accepts image files up to 5 MB. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Subfolder (next to the original asset) where processed images are stored. */
const PROCESSED_FOLDER = '已处理';

/**
 * Ensures Volcengine FacePretty API calls run one at a time.
 * Each request enqueues itself and waits for the previous one to finish.
 */
let apiQueue = Promise.resolve();

@Injectable()
export class FacePrettyService extends BaseService {
  async process(auth: AuthDto, id: string, dto: FacePrettyDto): Promise<FacePrettyResponseDto> {
    const env = this.configRepository.getEnv();
    const { accessKeyId, secretAccessKey } = env.volcengine;
    if (!accessKeyId || !secretAccessKey) {
      throw new BadRequestException('Volcengine FacePretty credentials are not configured on the server');
    }

    await this.requireAccess({ auth, permission: Permission.AssetRead, ids: [id] });

    const asset = await this.assetRepository.getById(id);
    if (!asset) {
      throw new BadRequestException('Asset not found');
    }
    if (asset.type !== AssetType.Image) {
      throw new BadRequestException('AI retouch is only supported for images');
    }

    this.logger.log(`Processing asset ${id} (${asset.originalPath}) with FacePretty`);

    // For RAW files, extract the camera-embedded JPEG preview (full resolution, good quality).
    // For regular images, sharp handles the conversion directly.
    const extracted = await this.mediaRepository.extract(asset.originalPath);
    let original: Buffer;
    if (extracted) {
      original = extracted.buffer;
      this.logger.log(`Using embedded ${extracted.format.toUpperCase()} preview from RAW file`);
    } else {
      original = await this.storageRepository.readFile(asset.originalPath);
    }
    const resized = await this.resizeUnderSize(original, MAX_IMAGE_BYTES);
    const imageBase64 = resized.toString('base64');

    const credentials: VolcengineCredentials = { accessKeyId, secretAccessKey };
    const options = {
      multiFace: dto.multiFace ?? true,
      beautyLevel: dto.beautyLevel,
      doRisk: dto.doRisk,
    };

    // Serialize API calls — only one FacePretty request at a time
    const prev = apiQueue;
    const { promise, resolve } = Promise.withResolvers<void>();
    apiQueue = promise;
    await prev;

    let processed: Buffer;
    try {
      processed = await facePretty(imageBase64, credentials, options);
    } finally {
      resolve();
    }

    const processedDir = path.join(path.dirname(asset.originalPath), PROCESSED_FOLDER);
    this.storageRepository.mkdirSync(processedDir);

    const baseName = path.parse(asset.originalFileName).name || `asset-${asset.id}`;
    const filename = await this.uniqueFilename(processedDir, `${baseName}_已处理`, '.jpg');
    const target = path.join(processedDir, filename);
    await this.storageRepository.createFile(target, processed);

    this.logger.log(`Saved FacePretty result for asset ${id} to ${target}`);

    // Register the processed image as a new Immich asset
    const checksum = this.cryptoRepository.hashSha1(processed);
    const fileStat = await this.storageRepository.stat(target);

    const newAsset = await this.assetRepository.create({
      ownerId: asset.ownerId,
      libraryId: asset.libraryId,
      type: AssetType.Image,
      checksum,
      checksumAlgorithm: ChecksumAlgorithm.sha1File,
      originalPath: target,
      originalFileName: filename,
      fileCreatedAt: fileStat.mtime,
      fileModifiedAt: fileStat.mtime,
      localDateTime: fileStat.mtime,
      isExternal: !!asset.libraryId,
    });

    await this.assetRepository.upsertExif({
      exif: { assetId: newAsset.id, fileSizeInByte: fileStat.size },
      lockedPropertiesBehavior: 'override',
    });

    await this.jobRepository.queue({
      name: JobName.AssetExtractMetadata,
      data: { id: newAsset.id, source: 'upload' },
    });

    this.logger.log(`Registered FacePretty result as asset ${newAsset.id}`);

    return { path: target, filename };
  }

  /**
   * Encodes the input image as JPEG and, if it exceeds `maxBytes`, iteratively
   * reduces quality and dimensions until it fits. The Volcengine API recommends
   * JPG and limits the image file size to 5 MB.
   */
  private async resizeUnderSize(buffer: Buffer, maxBytes: number): Promise<Buffer> {
    const metadata = await sharp(buffer, { limitInputPixels: false })
      .metadata()
      .catch(() => ({ width: 4096 }));
    let width = metadata.width ?? 4096;
    let quality = 90;
    let result = await this.encode(buffer, width, quality);

    let guard = 0;
    while (result.byteLength > maxBytes && guard < 30) {
      guard++;
      if (quality > 50) {
        quality -= 10;
      } else {
        width = Math.round(width * 0.85);
        if (width < 256) {
          break;
        }
      }
      result = await this.encode(buffer, width, quality);
    }
    return result;
  }

  private encode(buffer: Buffer, width: number, quality: number): Promise<Buffer> {
    return sharp(buffer, { limitInputPixels: false, failOn: 'none' })
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .jpeg({ quality, progressive: true, chromaSubsampling: '4:2:0' })
      .toBuffer();
  }

  private async uniqueFilename(dir: string, base: string, ext: string): Promise<string> {
    let name = `${base}${ext}`;
    let counter = 1;
    while (await this.storageRepository.checkFileExists(path.join(dir, name))) {
      name = `${base}_${counter++}${ext}`;
    }
    return name;
  }
}
