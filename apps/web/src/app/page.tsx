import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { MarketingFooter, MarketingHeader } from "@/components/marketing-chrome";
import {
  Audience,
  ClosingCta,
  DeliverySystem,
  Faq,
  FreeAudit,
  Hero,
  HonestLimits,
  HowItWorks,
  Pricing,
  ReportIsTheProduct,
} from "@/components/landing/sections";

/**
 * Вход в продукт. Залогиненного корень не задерживает: он пришёл работать,
 * а не читать про продукт.
 */

export const metadata: Metadata = {
  title: "Citeworthy — sell and deliver AI Search retainers",
  description:
    "Measure how ChatGPT, Perplexity and Gemini answer about your clients, diagnose which sources decide it, and report to the client in your own brand.",
};

export default async function HomePage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (session) {
    redirect("/dashboard");
  }

  return (
    <>
      <MarketingHeader />
      <main>
        <Hero />
        <ReportIsTheProduct />
        <DeliverySystem />
        <HowItWorks />
        <FreeAudit />
        <Pricing />
        <HonestLimits />
        <Audience />
        <Faq />
        <ClosingCta />
      </main>
      <MarketingFooter />
    </>
  );
}
