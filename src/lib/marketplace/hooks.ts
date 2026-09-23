import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth/auth-context';
import { getMyBusiness } from '@/lib/business/business-service';
import {
  addFavourite, getMyDashboardStats, listMyFavouriteIds, listMyNotifications, removeFavourite,
} from './engagement-service';

/** Every cache key in one place so invalidation stays consistent. */
export const queryKeys = {
  favourites: (uid: string) => ['favourites', uid] as const,
  favouriteVehicles: (uid: string) => ['favourites', uid, 'vehicles'] as const,
  myBusiness: (uid: string) => ['my-business', uid] as const,
  myVehicles: (uid: string) => ['my-vehicles', uid] as const,
  myVehicle: (id: string) => ['my-vehicle', id] as const,
  vehicleImages: (id: string) => ['vehicle-images', id] as const,
  vehicleDocuments: (id: string) => ['vehicle-documents', id] as const,
  stats: (uid: string) => ['dashboard-stats', uid] as const,
  notifications: (uid: string) => ['notifications', uid] as const,
  reviewsAbout: (uid: string) => ['reviews-about', uid] as const,
  similar: (id: string) => ['similar-vehicles', id] as const,
  vehiclePage: (id: string, uid: string) => ['vehicle-page', id, uid] as const,
};

/** Signed-in user id, or null while loading / signed out. */
export function useUserId(): string | null {
  const auth = useAuth();
  return auth.status === 'signed-in' ? auth.account.profile.id : null;
}

/** Sends a signed-out visitor to sign in, then back to the page they were on. */
export function useSignInRedirect() {
  const navigate = useNavigate();
  const href = useRouterState({ select: (s) => s.location.href });
  return useCallback(() => {
    void navigate({ to: '/login', search: { redirect: href } });
  }, [navigate, href]);
}

/**
 * Saved vehicles for the current visitor. Signed-out visitors are sent to
 * sign in when they tap the heart; the choice is stored server-side so it
 * follows them across devices.
 */
export function useFavourites() {
  const auth = useAuth();
  const uid = useUserId();
  const queryClient = useQueryClient();
  const goToSignIn = useSignInRedirect();

  const query = useQuery({
    queryKey: queryKeys.favourites(uid ?? 'anon'),
    queryFn: listMyFavouriteIds,
    enabled: Boolean(uid),
    staleTime: 60_000,
  });
  const saved = useMemo(() => new Set(query.data ?? []), [query.data]);

  const mutation = useMutation({
    mutationFn: async ({ id, save }: { id: string; save: boolean }) => (save ? addFavourite(id) : removeFavourite(id)),
    onMutate: async ({ id, save }) => {
      if (!uid) return { previous: undefined };
      const key = queryKeys.favourites(uid);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<string[]>(key);
      queryClient.setQueryData<string[]>(key, (old = []) => (save ? [id, ...old.filter((x) => x !== id)] : old.filter((x) => x !== id)));
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (uid && context?.previous) queryClient.setQueryData(queryKeys.favourites(uid), context.previous);
      toast.error(error instanceof Error ? error.message : 'We couldn’t update your saved vehicles.');
    },
    onSuccess: (_data, { save }) => {
      toast.success(save ? 'Saved. Find it under Saved vehicles.' : 'Removed from saved vehicles.');
    },
    onSettled: () => {
      if (uid) void queryClient.invalidateQueries({ queryKey: ['favourites', uid] });
    },
  });

  const toggle = useCallback(
    (id: string) => {
      if (auth.status === 'loading') return;
      if (!uid) {
        toast('Sign in to save vehicles', { description: 'Your saved list follows you on any device.' });
        goToSignIn();
        return;
      }
      mutation.mutate({ id, save: !saved.has(id) });
    },
    [auth.status, uid, saved, mutation, goToSignIn],
  );

  return { isSaved: (id: string | null | undefined) => Boolean(id && saved.has(id)), toggle, count: saved.size, ready: query.isSuccess };
}

export function useMyBusiness() {
  const uid = useUserId();
  return useQuery({
    queryKey: queryKeys.myBusiness(uid ?? 'anon'),
    queryFn: getMyBusiness,
    enabled: Boolean(uid),
    staleTime: 5 * 60_000,
  });
}

export function useDashboardStats() {
  const uid = useUserId();
  return useQuery({
    queryKey: queryKeys.stats(uid ?? 'anon'),
    queryFn: getMyDashboardStats,
    enabled: Boolean(uid),
    staleTime: 30_000,
  });
}

export function useNotifications(limit = 50) {
  const uid = useUserId();
  return useQuery({
    queryKey: [...queryKeys.notifications(uid ?? 'anon'), limit],
    queryFn: () => listMyNotifications(limit),
    enabled: Boolean(uid),
    staleTime: 30_000,
  });
}
