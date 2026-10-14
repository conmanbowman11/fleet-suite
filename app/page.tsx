"use client";

// THE FRONT DOOR. Sends each device to the right place:
//   not signed in        -> /login
//   signed in, no farm   -> /setup
//   no people yet        -> /who (add the first person)
//   device not set up    -> /device (Personal or Shared)
//   nobody picked        -> /who
//   otherwise            -> Equipment (mechanics) or PM (owners)

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { Loading, startPathFor } from "@/components/ui";

export default function Home() {
  const { status, activePeople, device, person } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;
    if (status === "signed_out") return router.replace("/login");
    if (status === "no_farm") return router.replace("/setup");
    if (activePeople.length === 0) return router.replace("/who");
    if (!device) return router.replace("/device");
    if (!person) return router.replace("/who");
    router.replace(startPathFor(person));
  }, [status, activePeople, device, person, router]);

  return <Loading />;
}
