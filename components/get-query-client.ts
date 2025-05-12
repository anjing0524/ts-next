import { QueryClient, defaultShouldDehydrateQuery, isServer } from '@tanstack/react-query';
// 可以使用prefetch功能
// const queryClient = getQueryClient()
//   void queryClient.prefetchQuery(pokemonOptions)
//   return (
//     <main>
//       <h1>Pokemon Info</h1>
//       <HydrationBoundary state={dehydrate(queryClient)}>
//         <PokemonInfo />
//       </HydrationBoundary>
//     </main>
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
      },
      dehydrate: {
        shouldDehydrateQuery: (query) =>
          // Only dehydrate queries that are in a stable state
          defaultShouldDehydrateQuery(query) && query.state.status !== 'pending',
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;

export function getQueryClient() {
  if (isServer) {
    // Server: always make a new query client
    return makeQueryClient();
  } else {
    if (!browserQueryClient) browserQueryClient = makeQueryClient();
    return browserQueryClient;
  }
}
