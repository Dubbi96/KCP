import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        type: 'postgres',
        host: cfg.get('DB_HOST', 'localhost'),
        port: cfg.get<number>('DB_PORT', 5432),
        username: cfg.get('DB_USERNAME', 'katab'),
        password: cfg.get('DB_PASSWORD', 'katab_secret'),
        database: cfg.get('DB_DATABASE', 'katab_control_plane'),
        autoLoadEntities: true,
        synchronize: false,
        migrationsRun: true,
        migrations: [path.join(__dirname, 'migrations', '*{.ts,.js}')],
        logging: cfg.get('NODE_ENV') === 'development' ? ['error'] : false,
        ...(cfg.get('NODE_ENV') !== 'development' && cfg.get('DB_HOST') !== 'localhost' && {
          ssl: { rejectUnauthorized: false },
        }),
      }),
    }),
  ],
})
export class DatabaseModule {}
