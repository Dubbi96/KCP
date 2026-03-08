import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
dotenv.config();

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USERNAME || 'katab',
  password: process.env.DB_PASSWORD || 'katab_secret',
  database: process.env.DB_DATABASE || 'katab_control_plane',
  entities: ['dist/**/*.entity.js'],
  migrations: ['dist/database/migrations/*.js'],
  ...(process.env.NODE_ENV !== 'development' && process.env.DB_HOST !== 'localhost' && {
    ssl: { rejectUnauthorized: false },
  }),
});
