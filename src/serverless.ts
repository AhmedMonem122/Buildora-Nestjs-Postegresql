import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter, type NestExpressApplication } from '@nestjs/platform-express';
import express, { type Express, type Request, type Response } from 'express';
import { AppModule } from './app.module.js';
import { configureApplication } from './bootstrap/configure-application.js';

let cachedServer: Promise<Express> | undefined;

/**
 * Vercel entry point. The Nest application is created once per warm function
 * instance and then reused. No long-lived server, timers, or in-memory queues
 * are registered here.
 */
async function createServer(): Promise<Express> {
  const server = express();
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(server),
    { bufferLogs: true },
  );

  configureApplication(app);
  await app.init();

  return server;
}

export default async function handler(request: Request, response: Response): Promise<void> {
  if (!cachedServer) {
    cachedServer = createServer().catch((error: unknown) => {
      // Do not cache a rejected promise: the next invocation should retry.
      cachedServer = undefined;
      throw error;
    });
  }

  const server = await cachedServer;
  server(request, response);
}
