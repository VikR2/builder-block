export const BILLING_PERIODS = ['monthly', 'quarterly', 'yearly'] as const;

export type BillingPeriod = (typeof BILLING_PERIODS)[number];

export interface PricingPlan {
  id: BillingPeriod;
  name: string;
  price: number;
  billingLabel: string;
  equivalentMonthly: number;
  savingsPercent: number;
  badge?: string;
  description: string;
}

export const PRICING_PLANS: readonly PricingPlan[] = [
  {
    id: 'monthly',
    name: 'Monthly',
    price: 25,
    billingLabel: 'billed every month',
    equivalentMonthly: 25,
    savingsPercent: 0,
    description: 'Full access with the most flexible billing cadence.',
  },
  {
    id: 'quarterly',
    name: 'Quarterly',
    price: 67.5,
    billingLabel: 'billed every three months',
    equivalentMonthly: 22.5,
    savingsPercent: 10,
    badge: 'Most popular',
    description: 'Stay with the process for a full market quarter.',
  },
  {
    id: 'yearly',
    name: 'Yearly',
    price: 240,
    billingLabel: 'billed once per year',
    equivalentMonthly: 20,
    savingsPercent: 20,
    badge: 'Best value',
    description: 'The lowest effective rate for committed traders.',
  },
] as const;

export function isBillingPeriod(value: unknown): value is BillingPeriod {
  return (
    typeof value === 'string' &&
    (BILLING_PERIODS as readonly string[]).includes(value)
  );
}

export function getPricingPlan(period: BillingPeriod): PricingPlan {
  const plan = PRICING_PLANS.find((candidate) => candidate.id === period);
  if (!plan) {
    throw new Error(`Unknown billing period: ${period}`);
  }
  return plan;
}
