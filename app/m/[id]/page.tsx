"use client";

// QR SCAN LINK - what a machine's sticker opens: /m/<machine id>
//   Personal device: straight to the machine.
//   Shared device:   "Who's working?" first (last person shows as
//                    "Continue as Jake"), then the machine.
//   Not signed in:   the farm login first. A stranger sees nothing.

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession, useRequireFarm } from "@/lib/session";
import { Loading } from "@/components/ui";

export default function ScanPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const ready = useRequireFarm();
  const { device, person } = useSession();

  useEffect(() => {
    if (!ready) return;
    const machine = `/equipment/${id}`;
    if (device?.mode === "personal" && person) router.replace(machine);
    else router.replace(`/who?next=${encodeURIComponent(machine)}`);
  }, [ready, device, person, id, router]);

  return <Loading />;
}
