import { PartialType } from '@nestjs/swagger';
import { CreateMotorcycleDto } from './create-motorcycle.dto';

export class UpdateMotorcycleDto extends PartialType(CreateMotorcycleDto) {}
