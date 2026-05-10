import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './modules/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['log', 'error', 'warn', 'debug'] });
  app.enableCors({ origin: true, credentials: true });
  app.setGlobalPrefix('v1');

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  Logger.log(`API ready on http://localhost:${port}/v1`, 'Bootstrap');
}

bootstrap();
