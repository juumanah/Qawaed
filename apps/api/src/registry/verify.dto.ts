import { IsUUID, Matches } from "class-validator";
export class VerifyDto {
  @IsUUID() filingId!: string;
  @Matches(/^\d{10}$/) identifierCr!: string;
}
