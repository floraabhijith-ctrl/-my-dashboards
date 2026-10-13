import bcrypt from "bcryptjs";

const ROUNDS = 12;

export const hashPassword = (plain: string) => bcrypt.hash(plain, ROUNDS);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

export function validatePasswordStrength(p: string): string | null {
  if (p.length < 10) return "Password must be at least 10 characters.";
  if (!/[A-Z]/.test(p) || !/[a-z]/.test(p) || !/[0-9]/.test(p)) {
    return "Password must include upper-case, lower-case and numeric characters.";
  }
  return null;
}
