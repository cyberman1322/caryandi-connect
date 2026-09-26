import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Start loading a page's code and data as soon as a link is hovered or touched,
    // so most of the wait is over by the time the tap/click completes.
    // (Route loaders are read-only public queries, so preloading them is safe.)
    defaultPreload: "intent",
    // A preloaded page stays usable for 30 s, so the tap that follows reuses it.
    defaultPreloadStaleTime: 30_000,
  });

  return router;
};
