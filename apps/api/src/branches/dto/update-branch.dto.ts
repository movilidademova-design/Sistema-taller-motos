import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsOptional } from 'class-validator';
import { BlankToUndefined } from '../../common/dto/blank-to-undefined.decorator';
import { CreateBranchDto } from './create-branch.dto';

export class UpdateBranchDto extends PartialType(
  OmitType(CreateBranchDto, ['email'] as const),
) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // Widened from CreateBranchDto's `email?: string` — the frontend sends `null`
  // (not `undefined`) to explicitly clear a previously-set email, since Prisma
  // ignores undefined fields on update but does clear the column on null.
  // @IsOptional() already skips @IsEmail() for both null and undefined.
  @ApiProperty({ required: false, nullable: true })
  @BlankToUndefined()
  @IsOptional()
  @IsEmail()
  email?: string | null;
}
