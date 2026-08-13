import { UnconfiguredPaymentProvider, type PaymentProvider } from "./payments";
import { StripePaymentProvider, type StripePrices } from "./stripe";

/**
 * Выбор платёжного провайдера — по тому же правилу, что адаптеры и почта:
 * без ключей продукт работает и честно говорит, что оплату не принимает.
 */
export function createPaymentProvider(env: NodeJS.ProcessEnv = process.env): PaymentProvider {
  const secretKey = env["STRIPE_SECRET_KEY"]?.trim();
  if (!secretKey) {
    return new UnconfiguredPaymentProvider();
  }

  const webhookSecret = env["STRIPE_WEBHOOK_SECRET"]?.trim();
  if (!webhookSecret) {
    throw new Error(
      "STRIPE_SECRET_KEY is set without STRIPE_WEBHOOK_SECRET. Without it a subscription change cannot be trusted.",
    );
  }

  const prices: StripePrices = {
    starter: env["STRIPE_PRICE_STARTER"]?.trim() ?? "",
    growth: env["STRIPE_PRICE_GROWTH"]?.trim() ?? "",
    scale: env["STRIPE_PRICE_SCALE"]?.trim() ?? "",
  };

  const missing = (Object.entries(prices) as [string, string][])
    .filter(([, value]) => !value)
    .map(([plan]) => plan);
  if (missing.length > 0) {
    // Половина настроенных планов хуже, чем ни одного: агентство упрётся в
    // ошибку уже после того, как решило заплатить.
    throw new Error(`Stripe price IDs are missing for: ${missing.join(", ")}.`);
  }

  return new StripePaymentProvider({ secretKey, webhookSecret, prices });
}
