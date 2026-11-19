import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  Max,
} from "class-validator";
import { Transform, Type } from "class-transformer";
export const statuses = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
];
export class FilingDto {
  @IsString() @MinLength(3) @MaxLength(255) title!: string;
  @Matches(/^\d{10}$/) identifier_cr!: string;
  @IsIn(["COMMERCIAL", "HEALTH", "TRANSPORT", "ENVIRONMENT"]) category!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) expiration_date!: string;
}
export class EditDto extends FilingDto {
  @IsInt() @Min(1) version!: number;
}
export class TransitionDto {
  @IsIn(statuses) status!: string;
  @IsInt() @Min(1) version!: number;
  @IsOptional() @IsString() @MaxLength(2000) rejection_reason?: string;
}
export class ListDto {
  @IsOptional() @IsString() @MaxLength(100)
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  search?: string;
  @IsOptional() @IsIn(statuses) status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
}
