import {
  assertTransition,
  assertTransitionRole,
} from "../src/filings/filing.policy";
import {
  ForbiddenException,
  UnprocessableEntityException,
  BadRequestException,
} from "@nestjs/common";
const states = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED"];
const permitted = new Set([
  "DRAFT:SUBMITTED",
  "SUBMITTED:UNDER_REVIEW",
  "UNDER_REVIEW:APPROVED",
  "UNDER_REVIEW:REJECTED",
]);
describe("filing policy unit tests", () => {
  it.each(states.flatMap((from) => states.map((to) => [from, to])))(
    "%s -> %s",
    (from, to) => {
      const action = () => assertTransition(from, to, "Missing evidence");
      if (permitted.has(`${from}:${to}`)) expect(action).not.toThrow();
      else expect(action).toThrow(UnprocessableEntityException);
    },
  );
  it("requires a meaningful rejection reason", () => {
    expect(() => assertTransition("UNDER_REVIEW", "REJECTED", "  ")).toThrow(
      BadRequestException,
    );
  });
  it("separates submission from review and keeps ADMIN read-only", () => {
    expect(() => assertTransitionRole("SUBMITTER", "SUBMITTED")).not.toThrow();
    expect(() => assertTransitionRole("AUDITOR", "APPROVED")).not.toThrow();
    expect(() => assertTransitionRole("SUBMITTER", "APPROVED")).toThrow(
      ForbiddenException,
    );
    expect(() => assertTransitionRole("AUDITOR", "SUBMITTED")).toThrow(
      ForbiddenException,
    );
    expect(() => assertTransitionRole("ADMIN", "APPROVED")).toThrow(
      ForbiddenException,
    );
  });
});
