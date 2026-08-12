import type { Metadata } from "next";
import { TrpcProvider } from "@/trpc/react";
import { ClientErrorReporting } from "@/components/client-error-reporting";
import "./globals.css";

export const metadata: Metadata = {
  title: "Citeworthy",
  description: "AI visibility measurement and delivery for agencies.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <ClientErrorReporting />
        <TrpcProvider>{children}</TrpcProvider>
      </body>
    </html>
  );
}
