import "server-only";

export function publicSignupSql(alias = "m"): string {
  return `COALESCE(sideline_public_signup_open(${alias}.id), false)`;
}
