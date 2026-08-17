"use client";

import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import { buttonClass } from "@/components/ui/button";

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
      className={buttonClass("outline", "md")}
    >
      Sign out
    </button>
  );
}
