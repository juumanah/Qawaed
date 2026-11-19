import { createHash } from "node:crypto";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";

export function loginLimits() {
  const shared = {
    windowMs: 15 * 60 * 1000,
    standardHeaders: "draft-8" as const,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { message: "Too many sign-in attempts. Try again later." },
  };
  return [
    // This is an intentionally generous network ceiling, including the web proxy.
    // Never trust a client-supplied forwarding header to bypass abuse protection.
    rateLimit({
      ...shared,
      limit: 300,
      keyGenerator: (req) => ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? "unknown"),
    }),
    rateLimit({
      ...shared,
      limit: 30,
      keyGenerator: (req) => {
        const email = typeof req.body?.email === "string"
          ? req.body.email.trim().toLowerCase().slice(0, 254)
          : "";
        // Account-wide failures are shared across direct and proxied requests.
        // Hash keys so the in-memory limiter does not retain raw email addresses.
        return createHash("sha256").update(email).digest("hex");
      },
    }),
  ];
}
