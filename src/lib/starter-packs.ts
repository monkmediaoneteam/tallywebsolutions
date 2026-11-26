// The store's starter packs: five groups of ten add-ons, and one pack with all fifty.
// Products are found by title, so nothing here depends on slugs. Client-safe: no database.

export type StarterPack = { slug: string; title: string; pitch: string; items: string[] };

export const STARTER_PACKS: StarterPack[] = [
  { slug: "security-access-control-pack", title: "Tally Security & Access Control Pack",
    pitch: "Your data, your rules. Lock every door, control every user, and sleep peacefully.",
    items: ["Backup Restore Security", "Disable Delete and Cancel Command", "Disable on Account", "Godown Security Module", "Group Security Control",
      "Ledger Level Security Control", "Lock Opening Balances", "Stock Items Lock", "Tally Locking Period", "Voucher Type Security"] },
  { slug: "audit-logs-approval-suite", title: "Audit Trail, Logs & Approval Suite",
    pitch: "Know who did what, when, and why. Total transparency with complete approval control.",
    items: ["Audit Trail with Stock Items", "eInvoice Voucher Auto Locked", "GST Vouchers Period Freeze", "Ledger Alteration Log", "Recycle Bin for Restoring Deleted Vouchers",
      "Stock Item Alteration Log", "User Activity Tracking and Logging System", "Vendor Approval Module", "Voucher Alteration Log", "Voucher Approval Module"] },
  { slug: "error-proof-compliance-control-pack", title: "Error-Proof Compliance & Control Pack",
    pitch: "Stop mistakes before they happen. Make every entry accurate, compliant, and audit-ready.",
    items: ["Cheque No. Tracking", "Credit Control based on Days", "Extract PAN from GSTIN", "Find Party Name from GSTIN", "Minimum and Maximum Rates",
      "Negative Cash Control", "Negative Stock Control", "Stop Cash Transaction above Rs. 10,000", "Stop Invoice without GSTIN & State", "Stop Transaction without Narration"] },
  { slug: "smart-automation-productivity-bundle", title: "Smart Automation & Productivity Bundle",
    pitch: "Let Tally do the repetitive work. Save hours every day and focus on growing your business.",
    items: ["Auto E-mail Facility Module", "Auto Narration Suggestion Module", "Auto Receipt Voucher on Sales", "Auto Stock Journal from Sales Voucher Entry with BOM Consumption",
      "Auto-save Reference Number for Transactions", "Bulk Backup in Tally", "Default Godown in Vouchers", "Delete All Unused Ledgers & Inventory Masters", "Task Reminder", "User Configured Backup"] },
  { slug: "professional-reports-invoice-printing-toolkit", title: "Professional Reports, Invoice & Printing Toolkit",
    pitch: "Impress clients, understand your numbers. Smarter reports and professional invoices in one click.",
    items: ["Advanced Address Book", "Cost Centre Filter Button for P & L", "Cost Centre Wise Profit & Loss", "Detailed P & L and Balance Sheet", "Envelope Printing Module",
      "HSN & SAC Code with GST Rate in Invoice", "Month-wise Expense Summary", "Multi Colour Gridlines", "Print Description in Place of Product & Ledger Name", "QR Code on Invoice for Payment"] },
];

export const COMPLETE_PACK = { slug: "complete-tally-professional-pack", title: "Complete Tally Professional Pack",
  pitch: "All 50 add-ons: security, audit, compliance, automation and reports, together." };

/** A title reduced to letters and digits, so "Stop Cash Transaction above ₹10,000", "...Rs. 10,000" and "Cheque No. Tracking.tdl" compare equal. */
export function titleKey(title: string): string {
  return title.toLowerCase().replace(/\.(tdl|tcp|zip)$/, "").replace(/₹/g, "rs").replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
}

/** The product for a wanted title: an exact match first, then one that starts with it (for example a title with "& State" cut short). */
export function findBook<T extends { slug: string; title: string }>(books: T[], wanted: string): T | undefined {
  const key = titleKey(wanted);
  return books.find((b) => titleKey(b.title) === key) ?? books.find((b) => { const k = titleKey(b.title); return k.length > 8 && (key.startsWith(k) || k.startsWith(key)); });
}

/** The packs to create, with the product slugs found for each and the titles that were not found. The complete pack holds every product found. */
export function planStarterPacks<T extends { slug: string; title: string }>(books: T[]) {
  const packs = STARTER_PACKS.map((p) => {
    const found = p.items.map((title) => ({ title, book: findBook(books, title) }));
    return { slug: p.slug, title: p.title, pitch: p.pitch, slugs: found.flatMap((x) => x.book ? [x.book.slug] : []), missing: found.filter((x) => !x.book).map((x) => x.title) };
  });
  const all = [...new Set(packs.flatMap((p) => p.slugs))];
  return [...packs, { slug: COMPLETE_PACK.slug, title: COMPLETE_PACK.title, pitch: COMPLETE_PACK.pitch, slugs: all, missing: packs.flatMap((p) => p.missing) }];
}
