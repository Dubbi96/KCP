import { IsString, IsArray, IsOptional, IsInt, Min, IsIn } from 'class-validator';

export class CreateRunDto {
  @IsString()
  tenantId: string;

  @IsArray()
  @IsString({ each: true })
  scenarioIds: string[];

  @IsString()
  platform: string;

  @IsString()
  @IsIn(['single', 'batch', 'chain', 'stream'])
  @IsOptional()
  mode?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  concurrency?: number;

  @IsOptional()
  options?: Record<string, any>;

  @IsString()
  @IsOptional()
  scheduleId?: string;

  @IsString()
  @IsOptional()
  streamId?: string;
}
