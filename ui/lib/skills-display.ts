interface SkillCategoryRecord {
  category: string;
  count: number;
}

interface SkillDisplayRecord {
  category: string;
  subcategory: string | null;
}

function titleCaseToken(token: string): string {
  if (token.length === 0) {
    return token;
  }

  if (/^[A-Z0-9]+$/.test(token)) {
    return token;
  }

  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

export function formatSkillLabel(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return null;
  }

  return normalized
    .split(' ')
    .map(titleCaseToken)
    .join(' ');
}

export function normalizeSkillRecord<T extends SkillDisplayRecord>(skill: T): T {
  return {
    ...skill,
    category: formatSkillLabel(skill.category) ?? skill.category,
    subcategory: formatSkillLabel(skill.subcategory),
  };
}

export function normalizeSkillCategories(categories: SkillCategoryRecord[]): SkillCategoryRecord[] {
  const merged = new Map<string, number>();

  for (const category of categories) {
    const label = formatSkillLabel(category.category) ?? category.category;
    merged.set(label, (merged.get(label) ?? 0) + category.count);
  }

  return [...merged.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([category, count]) => ({ category, count }));
}
