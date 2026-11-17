import { PRODUCT_STATUSES, type ProductStatus } from "@/lib/product-status";

const tone: Record<ProductStatus, string> = {
  "on-sale": "bg-gold/10 text-gold",
  "not-on-sale": "bg-bg-3 text-ink-soft",
  hidden: "bg-danger/10 text-danger",
  submission: "bg-brand/10 text-brand",
};

export default function StatusBadge({ status }: { status: ProductStatus }) {
  return <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${tone[status]}`}>
    <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />{PRODUCT_STATUSES[status]}
  </span>;
}
