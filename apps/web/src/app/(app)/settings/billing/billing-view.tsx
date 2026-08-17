"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { cn } from "@/lib/utils";
import { buttonClass } from "@/components/ui/button";

const PLAN_NAMES: Record<string, string> = {
  starter: "Starter",
  growth: "Growth",
  scale: "Scale",
};

export function BillingView() {
  const subscription = api.billing.subscription.useQuery();
  const [error, setError] = useState<string | null>(null);

  const checkout = api.billing.checkout.useMutation({
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (mutationError) => setError(mutationError.message),
  });

  const portal = api.billing.portal.useMutation({
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (mutationError) => setError(mutationError.message),
  });

  const data = subscription.data;
  if (!data) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  const { entitlements } = data;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 rounded-lg border p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <span data-testid="current-plan" className="text-lg font-medium">
            {PLAN_NAMES[entitlements.plan] ?? entitlements.plan}
          </span>
          <span className="metric text-sm text-muted-foreground">
            {data.clientsUsed} of {entitlements.clientLimit} clients ·{" "}
            {entitlements.aiCheckAllowance.toLocaleString("en-US")} AI checks a month
          </span>
        </div>

        <p data-testid="plan-reason" className="text-sm text-muted-foreground">
          {entitlements.reason}
        </p>

        {data.currentPeriodEnd && (
          <p className="metric text-sm text-muted-foreground">
            {data.cancelAtPeriodEnd ? "Ends" : "Renews"} on{" "}
            {new Date(data.currentPeriodEnd).toLocaleDateString()}.
          </p>
        )}
      </div>

      {!data.paymentsConfigured && (
        // Ни фальшивого checkout, ни кнопки, которая упадёт: пока провайдер
        // не подключён, продукт говорит это прямо.
        <p data-testid="payments-off" className="text-sm text-muted-foreground">
          Payments are not connected yet, so plans cannot be changed from here. The starter limits
          apply and everything else in the product works.
        </p>
      )}

      {error && (
        <p data-testid="form-error" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        {data.plans.map((plan) => {
          const current = plan.id === entitlements.plan;

          return (
            <div
              key={plan.id}
              className={cn(
                "flex flex-col gap-2 rounded-lg border p-5",
                current && "border-primary",
              )}
            >
              <span className="font-medium">{PLAN_NAMES[plan.id] ?? plan.id}</span>
              <span className="metric text-2xl font-semibold tracking-tight">
                ${plan.priceUsd.toLocaleString("en-US")}
                <span className="text-sm font-normal text-muted-foreground"> / month</span>
              </span>
              <span className="metric text-sm text-muted-foreground">
                up to {plan.clientLimit} clients ·{" "}
                {plan.aiCheckAllowance.toLocaleString("en-US")} checks
              </span>

              {data.paymentsConfigured && !current && (
                <button
                  type="button"
                  data-testid={`choose-${plan.id}`}
                  onClick={() => {
                    setError(null);
                    checkout.mutate({ plan: plan.id });
                  }}
                  disabled={checkout.isPending}
                  className={buttonClass("primary", "lg", "mt-2 w-full")}
                >
                  Choose {PLAN_NAMES[plan.id] ?? plan.id}
                </button>
              )}

              {current && (
                <span className="mt-2 text-sm font-medium text-primary">Current plan</span>
              )}
            </div>
          );
        })}
      </div>

      {data.paymentsConfigured && data.hasCustomer && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            data-testid="open-portal"
            onClick={() => {
              setError(null);
              portal.mutate();
            }}
            disabled={portal.isPending}
            className={buttonClass("outline", "lg", "self-start")}
          >
            Manage billing
          </button>
          {/* Карта и счета живут у провайдера: продукт платёжных данных не хранит. */}
          <p className="text-sm text-muted-foreground">
            Card, invoices and cancellation are handled by our payment provider.
          </p>
        </div>
      )}
    </div>
  );
}
