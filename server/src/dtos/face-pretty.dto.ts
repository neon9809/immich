import { createZodDto } from 'nestjs-zod';
import z from 'zod';

const FacePrettySchema = z
  .object({
    multiFace: z
      .boolean()
      .optional()
      .describe('When true, beautify all faces; otherwise only the largest face. Defaults to true.'),
    beautyLevel: z.number().min(0).max(1).optional().describe('Beauty level in the range [0.0, 1.0]. Defaults to 1.0.'),
    doRisk: z.boolean().optional().describe('Whether to run content moderation on the input image.'),
  })
  .meta({ id: 'FacePrettyDto' });

export class FacePrettyDto extends createZodDto(FacePrettySchema) {}

const FacePrettyResponseSchema = z
  .object({
    path: z.string().describe('Absolute path of the saved processed image.'),
    filename: z.string().describe('Filename of the saved processed image.'),
  })
  .meta({ id: 'FacePrettyResponseDto' });

export class FacePrettyResponseDto extends createZodDto(FacePrettyResponseSchema) {}
