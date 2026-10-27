/**
 * Hossidev Water Monitor - General Validation Utilities
 */

/**
 * Validates email address format according to standard RFC patterns.
 */
export function isValidEmail(email: string | null | undefined): boolean {
  if (!email || typeof email !== 'string') return false;
  const regex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return regex.test(email.trim());
}

/**
 * Validates port numbers for network services (1 - 65535).
 */
export function isValidPort(port: number | string | null | undefined): boolean {
  const p = Number(port);
  return Number.isInteger(p) && p >= 1 && p <= 65535;
}
