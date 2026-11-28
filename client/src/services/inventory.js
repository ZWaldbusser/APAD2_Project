import { listHardware, responseData } from "./hardware";

const count = (value) => Number.isSafeInteger(value) && value >= 0;

// Inventory presentation requires a complete collection; a failed or truncated
// page must not replace an earlier response with an apparently smaller stock.
export async function readSharedInventory() {
  const rows = [];
  let expectedTotal, pageSize;
  for (let page = 1; ; page += 1) {
    const data = await responseData(await listHardware({ page, size: 100 }));
    if (page === 1 && Array.isArray(data)) return data;
    if (
      !data || !Array.isArray(data.items) || !count(data.total) ||
      data.page !== page || !count(data.size) || data.size < 1 || data.size > 100 ||
      data.items.length > data.size ||
      (expectedTotal !== undefined && data.total !== expectedTotal) ||
      (pageSize !== undefined && data.size !== pageSize)
    ) throw new Error("Inconsistent inventory page");
    expectedTotal = data.total;
    pageSize = data.size;
    rows.push(...data.items);
    if (rows.length === expectedTotal) return rows;
    if (rows.length > expectedTotal || data.items.length < pageSize)
      throw new Error("Incomplete inventory response");
  }
}
