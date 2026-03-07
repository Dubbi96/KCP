import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as fs from 'fs';
import { AppModule } from './app.module';

async function bootstrap() {
  // mTLS: if certificates are configured, start HTTPS server with client cert verification
  const mtlsEnabled = process.env.MTLS_ENABLED === 'true';
  const httpsOptions = mtlsEnabled ? {
    key: fs.readFileSync(process.env.MTLS_SERVER_KEY!),
    cert: fs.readFileSync(process.env.MTLS_SERVER_CERT!),
    ca: fs.readFileSync(process.env.MTLS_CA_CERT!),
    requestCert: true,         // Ask clients for certificates
    rejectUnauthorized: false, // Don't reject — let guards handle auth decisions
  } : undefined;

  const app = httpsOptions
    ? await NestFactory.create(AppModule, { httpsOptions })
    : await NestFactory.create(AppModule);

  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',').map((s) => s.trim()) || '*',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );

  app.setGlobalPrefix('api', {
    exclude: ['dashboard'],
  });

  const port = process.env.PORT || 4100;
  await app.listen(port);

  const protocol = mtlsEnabled ? 'https' : 'http';
  console.log(`[KCP] Control Plane running on ${protocol}://0.0.0.0:${port}`);
  if (mtlsEnabled) {
    console.log('[KCP] mTLS enabled — client certificates will be verified');
  }
}
bootstrap();
