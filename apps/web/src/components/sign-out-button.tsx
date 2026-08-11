"use client";

import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={async () => {
        await signOut();
        router.push("/login");
        router.refresh();
      }}
      className="h-9 rounded-md border border-input px-3 text-sm font-medium hover:bg-accent"
    >
      Sign out
    </button>
  );
}
