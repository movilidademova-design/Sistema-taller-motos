import { PartialType, OmitType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateUserDto } from './create-user.dto';

// branchIds is excluded, not just password: branch reassignment is already its
// own dedicated ADMIN-only operation (POST /users/:id/branches -> assignBranches),
// and User has no branchIds column — passing it through to Prisma's update() would
// crash the same way the pre-existing password-in-create() bug did.
export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['password', 'branchIds'] as const),
) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
