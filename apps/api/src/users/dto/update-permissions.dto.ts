import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, ValidateNested } from 'class-validator';
import { PERMISSIONS } from '../../common/permissions/permission.constants';
import type { PermissionKey } from '../../common/permissions/permission.constants';

export class PermissionOverrideDto {
  @ApiProperty({ enum: PERMISSIONS })
  @IsIn(PERMISSIONS)
  permission: PermissionKey;

  @ApiProperty()
  @IsBoolean()
  granted: boolean;
}

export class UpdatePermissionsDto {
  @ApiProperty({ type: [PermissionOverrideDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PermissionOverrideDto)
  overrides: PermissionOverrideDto[];
}
