export const FILINGS_PAGE_SIZE = 20;

// Decisions can remove the last item from a filtered page.
export function pageForTotal(page: number, total: number) {
  return Math.max(1, Math.min(page, Math.ceil(total / FILINGS_PAGE_SIZE)));
}
