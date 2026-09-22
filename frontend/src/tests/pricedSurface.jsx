import { QueryClientProvider } from "@tanstack/react-query";

import { queryClient } from "../queryClient";

/**
 * Renders a surface that reads prices, against the cache the readers use.
 *
 * A priced surface asks for what it draws through `useMarketPricesQuery` and
 * reads the figures back synchronously. Both halves have to meet in one cache:
 * `seedPrices` writes to the module-level client and `readPrice` reads from it,
 * so a test handing the query a client of its own would have the query fetching
 * for real while the reader answered from rows it could not see.
 *
 * @param {{children: import("react").ReactNode}} props
 */
export function PricedSurface({ children }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
