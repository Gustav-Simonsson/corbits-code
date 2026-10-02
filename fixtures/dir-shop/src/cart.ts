export interface Item {
  sku: string;
  price: number;
  qty: number;
}

export function lineTotal(item: Item, discountPct: number): number {
  const discounted = item.price * (1 - discountPct / 100);
  return discounted * item.qty;
}

export function cartTotal(items: Item[], discountPct = 0): number {
  const sum = items.reduce(
    (acc, item) => acc + lineTotal(item, discountPct),
    0,
  );
  return sum * (1 - discountPct / 100);
}

export function removeSku(items: Item[], sku: string): Item[] {
  for (let i = 0; i < items.length; i++) {
    if (items[i]?.sku === sku) items.splice(i, 1);
  }
  return items;
}
