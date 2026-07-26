import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Endpoint, HistoryBuilder } from 'src/decorators';
import { AuthDto } from 'src/dtos/auth.dto';
import { FacePrettyDto, FacePrettyResponseDto } from 'src/dtos/face-pretty.dto';
import { ApiTag, Permission } from 'src/enum';
import { Auth, Authenticated } from 'src/middleware/auth.guard';
import { FacePrettyService } from 'src/services/face-pretty.service';
import { UUIDParamDto } from 'src/validation';

@ApiTags(ApiTag.Assets)
@Controller('face-pretty')
export class FacePrettyController {
  constructor(private service: FacePrettyService) {}

  @Post(':id')
  @Authenticated({ permission: Permission.AssetRead })
  @Endpoint({
    summary: 'AI face retouch (FacePretty)',
    description:
      'Generates a JPEG version of the image under 5 MB, submits it to the Volcengine FacePretty API, ' +
      'and saves the returned image to a 已处理 folder next to the original. ' +
      'Volcengine credentials are read from the server environment so they are never exposed to the client.',
    history: new HistoryBuilder().added('v1'),
  })
  facePretty(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Body() dto: FacePrettyDto,
  ): Promise<FacePrettyResponseDto> {
    return this.service.process(auth, id, dto);
  }
}
