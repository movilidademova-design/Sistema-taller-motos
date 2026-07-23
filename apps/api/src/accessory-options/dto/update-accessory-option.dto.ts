import { PartialType } from '@nestjs/swagger';
import { CreateAccessoryOptionDto } from './create-accessory-option.dto';

export class UpdateAccessoryOptionDto extends PartialType(CreateAccessoryOptionDto) {}
