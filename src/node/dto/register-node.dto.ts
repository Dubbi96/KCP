import { IsString, IsInt, IsArray, IsOptional, Min } from 'class-validator';

export class RegisterNodeDto {
  @IsString()
  name: string;

  @IsString()
  host: string;

  @IsInt()
  @Min(1)
  port: number;

  @IsArray()
  @IsString({ each: true })
  platforms: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  labels?: string[];

  @IsString()
  @IsOptional()
  version?: string;
}

export class HeartbeatDto {
  @IsString()
  status: string;

  @IsInt()
  @IsOptional()
  cpuCores?: number;

  @IsInt()
  @IsOptional()
  memoryMb?: number;

  @IsInt()
  @IsOptional()
  diskGb?: number;

  @IsOptional()
  cpuUsagePercent?: number;

  @IsOptional()
  memoryUsagePercent?: number;

  @IsOptional()
  loadAverage?: number[];

  @IsArray()
  @IsOptional()
  devices?: any[];

  @IsOptional()
  slots?: Record<string, any>;

  @IsOptional()
  activeSessions?: number;

  @IsOptional()
  appiumHealth?: Record<string, boolean>;

  @IsOptional()
  playwrightHealth?: boolean;

  @IsOptional()
  diskUsagePercent?: number;

  @IsString()
  @IsOptional()
  agentVersion?: string;

  @IsOptional()
  localApiPort?: number;

  @IsString()
  @IsOptional()
  localApiHost?: string;
}
