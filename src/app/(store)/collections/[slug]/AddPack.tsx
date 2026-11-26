"use client";

import { ShoppingBag } from "lucide-react";
import { useCart } from "@/components/CartProvider";

// Puts every product of the pack in the cart at once. The pack price is applied by the cart itself when the whole pack is there.
export default function AddPack({ slugs, enabled }: { slugs: string[]; enabled: boolean }) {
  const cart = useCart();
  const inCart = slugs.length > 0 && slugs.every((s) => cart.slugs.includes(s));
  return <button type="button" className="btn btn-primary" disabled={!enabled || !cart.ready} onClick={() => (inCart ? cart.openDrawer() : cart.addMany(slugs))}>
    <ShoppingBag size={17} aria-hidden="true" />{!enabled ? "Ordering opens soon" : inCart ? "Pack is in your cart" : `Add all ${slugs.length} to cart`}</button>;
}
