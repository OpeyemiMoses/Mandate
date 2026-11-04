import { prisma } from "@/lib/db";
import { authenticateRequest, AuthenticationError } from "./auth/authenticateRequest";

export * from "./auth/index";

/**
 * Authentication & Session Helper.
 * Resolves full authenticated User record using the centralized auth engine.
 * Strictly scopes to authenticated identity; never falls back to shared accounts.
 */
export async function getAuthenticatedUser(req: Request) {
  const context = await authenticateRequest(req);
  const user = await prisma.user.findUnique({
    where: { id: context.userId },
    include: {
      agents: {
        include: { wallet: true },
      },
    },
  });

  if (!user) {
    throw new AuthenticationError("Unauthorized: User not found");
  }

  return user;
}
