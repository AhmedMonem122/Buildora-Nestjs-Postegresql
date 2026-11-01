import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';
import { LivenessDataDto, ReadinessDataDto } from './dto/health-response.dto.js';
import { HealthService } from './health.service.js';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Liveness probe',
    description: 'Confirms that the HTTP process is running. It does not touch the database.',
  })
  @ApiOkResponse({
    description: 'The API process is alive.',
    schema: {
      example: {
        success: true,
        data: {
          status: 'ok',
          uptimeSeconds: 3600.42,
          timestamp: '2026-01-01T00:00:00.000Z',
          version: '0.1.0',
        },
      },
    },
  })
  getLiveness(): LivenessDataDto {
    return this.healthService.getLiveness();
  }

  @Public()
  @Get('ready')
  @ApiOperation({
    summary: 'Readiness probe',
    description: 'Verifies that the API can reach PostgreSQL before accepting traffic.',
  })
  @ApiOkResponse({
    description: 'The API and its database dependency are ready.',
    schema: {
      example: {
        success: true,
        data: {
          status: 'ok',
          timestamp: '2026-01-01T00:00:00.000Z',
          version: '0.1.0',
          checks: { database: { status: 'up', latencyMs: 12 } },
        },
      },
    },
  })
  @ApiServiceUnavailableResponse({ description: 'PostgreSQL is unreachable or timed out.' })
  getReadiness(): Promise<ReadinessDataDto> {
    return this.healthService.getReadiness();
  }
}
