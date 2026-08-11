import type { Metadata } from "next";
import { TrpcProvider } from "@/trpc/react";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Search Delivery OS",
  description: "Sell and deliver AI Search retainers without adding headcount.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <TrpcProvider>{children}</TrpcProvider>
      </body>
    </html>
  );
}
