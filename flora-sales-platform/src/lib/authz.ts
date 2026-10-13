/**
 * Server-side authorization. Every data operation must go through these helpers.
 *
 * Visibility rules
 *  - SALES_EXECUTIVE : enquiries they own (ownerId === user.id).
 *  - SALES_MANAGER   : enquiries owned by their direct team members, enquiries at
 *                      their assigned properties, and enquiries they own themselves.
 *  - ADMIN           : everything.
 */
import { and, eq, inArray, or, isNull, type SQL } from "drizzle-orm";
import { enquiries, type Enquiry, type UserRole } from "./db/schema";
import type { CurrentUser } from "./auth/session";

export class AuthzError extends Error {
  status: number;
  constructor(message = "Forbidden", status = 403) {
    super(message);
    this.status = status;
  }
}

export const isManagement = (u: CurrentUser) => u.role === "SALES_MANAGER" || u.role === "ADMIN";
export const isAdmin = (u: CurrentUser) => u.role === "ADMIN";

/** SQL predicate restricting an enquiry query to records visible to the user. */
export function visibleEnquiriesWhere(user: CurrentUser): SQL {
  const notDeleted = isNull(enquiries.deletedAt);
  switch (user.role) {
    case "ADMIN":
      return notDeleted;
    case "SALES_MANAGER": {
      const ownerIds = [user.id, ...user.teamMemberIds];
      const parts: SQL[] = [inArray(enquiries.ownerId, ownerIds)];
      if (user.propertyIds.length) parts.push(inArray(enquiries.propertyId, user.propertyIds));
      return and(notDeleted, or(...parts))!;
    }
    case "SALES_EXECUTIVE":
    default:
      return and(notDeleted, eq(enquiries.ownerId, user.id))!;
  }
}

export function canViewEnquiry(user: CurrentUser, e: Pick<Enquiry, "ownerId" | "propertyId" | "deletedAt">): boolean {
  if (e.deletedAt) return user.role === "ADMIN";
  if (user.role === "ADMIN") return true;
  if (e.ownerId === user.id) return true;
  if (user.role === "SALES_MANAGER") {
    return user.teamMemberIds.includes(e.ownerId) || user.propertyIds.includes(e.propertyId);
  }
  return false;
}

export function canEditEnquiry(user: CurrentUser, e: Pick<Enquiry, "ownerId" | "propertyId" | "deletedAt">): boolean {
  return canViewEnquiry(user, e);
}

/** Which users may be assigned as owner by this user when creating/reassigning. */
export function canAssignOwner(user: CurrentUser, targetOwnerId: string): boolean {
  if (user.role === "ADMIN") return true;
  if (user.role === "SALES_MANAGER") return targetOwnerId === user.id || user.teamMemberIds.includes(targetOwnerId);
  return targetOwnerId === user.id;
}

export function canReassign(user: CurrentUser): boolean {
  return isManagement(user);
}

export function canDeleteEnquiry(user: CurrentUser): boolean {
  return user.role === "ADMIN";
}

export function canExport(user: CurrentUser): boolean {
  return isManagement(user);
}

export function canApprove(user: CurrentUser, discountBps: number): boolean {
  if (user.role === "ADMIN") return true;
  if (user.role === "SALES_MANAGER") return discountBps <= user.approvalLimitBps;
  return false;
}

export function canViewPropertyScope(user: CurrentUser, propertyId: string): boolean {
  if (user.role === "ADMIN") return true;
  if (user.role === "SALES_MANAGER") return user.propertyIds.length === 0 || user.propertyIds.includes(propertyId);
  return true; // executives may register an enquiry at any active property
}

export function requireRole(user: CurrentUser, roles: UserRole[]) {
  if (!roles.includes(user.role)) throw new AuthzError();
}

/** Fields an executive is never allowed to change directly. */
export const PROTECTED_FIELDS = ["ownerId", "approvedRate", "isDemo", "enquiryRef", "createdById", "version"] as const;
