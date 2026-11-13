/**
 * Rule (H4.2, Nov 9 2026): a session is good only while its account exists and the password
 * hasn't changed since the session began. A teacher's reset, or the user's own change, ends
 * every session that started before it.
 */
export function sessionEnded(
  account: { passwordChangedAt: Date | null } | null | undefined,
  issuedAt: number
): boolean {
  if (!account) return true;
  return !!account.passwordChangedAt && account.passwordChangedAt.getTime() > issuedAt;
}
