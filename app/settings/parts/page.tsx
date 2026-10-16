"use client";

// The parts list moved to its own page in the sidebar (/parts).
// This old address just forwards there, so saved links keep working.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function OldPartsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/parts");
  }, [router]);
  return null;
}
