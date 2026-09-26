import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Clock, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getMyVehicleVerification } from '@/lib/verification/verification-service';

const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
const snoozeKey = (vehicleId: string) => `caryandi:verify-prompt:${vehicleId}`;

function isSnoozed(vehicleId: string): boolean {
  try {
    const at = Number(window.localStorage.getItem(snoozeKey(vehicleId)));
    return Number.isFinite(at) && at > 0 && Date.now() - at < SNOOZE_MS;
  } catch {
    return false;
  }
}

/**
 * Shown to the SELLER in a buyer's conversation about one of their cars that isn't
 * verified yet. Optional: "Not now" hides it for a week (on this device).
 */
export function VerifyCarPrompt({ vehicleId }: { vehicleId: string }) {
  const state = useQuery({
    queryKey: ['vehicle-verification', vehicleId],
    queryFn: () => getMyVehicleVerification(vehicleId),
    staleTime: 60_000,
  });
  // Read the snooze after mount so server and browser render the same markup.
  const [snoozed, setSnoozed] = useState(true);
  useEffect(() => setSnoozed(isSnoozed(vehicleId)), [vehicleId]);

  const data = state.data;
  if (!data || !data.canVerify) return null;

  if (data.status === 'pending') {
    return (
      <p className="mx-3 mb-3 mt-1 flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
        <Clock className="size-3.5 shrink-0" />This car’s documents are being checked. Buyers will see the “Verified vehicle” badge once approved.
      </p>
    );
  }
  if (data.status === 'approved' || snoozed) return null;

  const notNow = () => {
    try { window.localStorage.setItem(snoozeKey(vehicleId), String(Date.now())); } catch { /* storage unavailable: hide for this visit only */ }
    setSnoozed(true);
  };

  return (
    <div role="note" className="mx-3 mb-3 mt-1 grid gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="flex min-w-0 gap-2">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">Reassure this buyer: verify your car</p>
          <p className="text-xs text-muted-foreground">
            Upload the registration book or import papers and your listing gets a “Verified vehicle” badge. It’s free and optional.
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button size="sm" asChild><Link to="/dashboard/verification" search={{ vehicle: vehicleId }}>Verify now</Link></Button>
        <Button size="sm" variant="ghost" onClick={notNow}><X />Not now</Button>
      </div>
    </div>
  );
}
