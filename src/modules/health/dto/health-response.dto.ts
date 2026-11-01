import { ApiProperty } from '@nestjs/swagger';

export class DatabaseHealthDto {
  @ApiProperty({ enum: ['up'], example: 'up' })
  status!: 'up';

  @ApiProperty({
    example: 12,
    description: 'Round-trip time of the database probe in milliseconds.',
  })
  latencyMs!: number;
}

export class ReadinessChecksDto {
  @ApiProperty({ type: DatabaseHealthDto })
  database!: DatabaseHealthDto;
}

export class LivenessDataDto {
  @ApiProperty({ example: 'ok' })
  status!: 'ok';

  @ApiProperty({ example: 3600.42, description: 'Process uptime in seconds.' })
  uptimeSeconds!: number;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  timestamp!: string;

  @ApiProperty({ example: '0.1.0' })
  version!: string;
}

export class ReadinessDataDto {
  @ApiProperty({ example: 'ok' })
  status!: 'ok';

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  timestamp!: string;

  @ApiProperty({ example: '0.1.0' })
  version!: string;

  @ApiProperty({ type: ReadinessChecksDto })
  checks!: ReadinessChecksDto;
}
