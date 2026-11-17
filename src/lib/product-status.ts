// Product statuses for the admin list. Kept free of server imports so client components (the table, badges) can use it.
export const PRODUCT_STATUSES = {
  "on-sale": "On sale",
  "not-on-sale": "Not on sale",
  hidden: "Hidden",
  submission: "Developer submission",
} as const;
export type ProductStatus = keyof typeof PRODUCT_STATUSES;
