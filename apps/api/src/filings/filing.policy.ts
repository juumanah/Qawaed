import {
  BadRequestException,
  ForbiddenException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Role } from "../auth/identity";
const transitions: Record<string, readonly string[]> = {
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["UNDER_REVIEW"],
  UNDER_REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: [],
  REJECTED: [],
};
export function assertTransitionRole(role: Role, target: string) {
  if (!(
    (role === "SUBMITTER" && target === "SUBMITTED") ||
    (role === "AUDITOR" &&
      ["UNDER_REVIEW", "APPROVED", "REJECTED"].includes(target))
  ))
    throw new ForbiddenException("Role cannot perform this action");
}
export function assertTransition(
  current: string,
  target: string,
  reason?: string,
) {
  if (!transitions[current]?.includes(target))
    throw new UnprocessableEntityException("Illegal state transition");
  if (target === "REJECTED" && !reason?.trim())
    throw new BadRequestException("Rejection reason is required");
}
