import { Global, Module } from '@nestjs/common';
import { PrismaErrorMapper } from './prisma-error.mapper.js';
import { PrismaService } from './prisma.service.js';

/**
 * Database infrastructure is shared by every domain module. Keeping it global
 * avoids repeating an implementation-only import in dozens of feature modules.
 */
@Global()
@Module({
  providers: [PrismaService, PrismaErrorMapper],
  exports: [PrismaService, PrismaErrorMapper],
})
export class PrismaModule {}
