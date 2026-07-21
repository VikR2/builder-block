const HIDDEN_TEACHTRADES_TERMS = [
  'teachtrades',
  'teach trades',
  'ttrades',
  'ttfm',
] as const;

const HIDDEN_TEACHTRADES_PATTERN = /\b(?:teach\s*trades|teachtrades|ttrades|ttfm)\b/i;
const HIDDEN_SKILL_COLUMNS = ['name', 'slug', 'category', 'subcategory', 'description'] as const;

export function containsTeachTrades(...values: Array<string | null | undefined>): boolean {
  return values.some((value) => Boolean(value && HIDDEN_TEACHTRADES_PATTERN.test(value)));
}

export function buildTeachTradesSkillSql(alias?: string): string {
  const prefix = alias ? `${alias}.` : '';
  const clauses = HIDDEN_SKILL_COLUMNS.flatMap((column) =>
    HIDDEN_TEACHTRADES_TERMS.map((term) => `lower(coalesce(${prefix}${column}, '')) LIKE '%${term}%'`)
  );

  return `NOT (${clauses.join(' OR ')})`;
}
