import { expect, test } from "bun:test";
import { cartTotal, lineTotal, removeSku } from "../src/cart";

test("line total without discount", () => {
  expect(lineTotal({ sku: "a", price: 10, qty: 2 }, 0)).toBe(20);
});

test("cart total without discount", () => {
  expect(cartTotal([{ sku: "a", price: 10, qty: 2 }])).toBe(20);
});

test("removes a single sku", () => {
  const out = removeSku(
    [
      { sku: "a", price: 1, qty: 1 },
      { sku: "b", price: 1, qty: 1 },
    ],
    "a",
  );
  expect(out.map((i) => i.sku)).toEqual(["b"]);
});

test("removes all matching skus", () => {
  const out = removeSku(
    [
      { sku: "a", price: 1, qty: 1 },
      { sku: "a", price: 1, qty: 1 },
      { sku: "b", price: 1, qty: 1 },
    ],
    "a",
  );
  expect(out.map((i) => i.sku)).toEqual(["b"]);
});
