import { renderRich } from "@/lib/rich-text-render";

// A description written with the editor's formatting (see lib/rich-text.ts), drawn safely. Plain text with blank lines works too.
export default function RichText({ text, className = "" }: { text: string | null | undefined; className?: string }) {
  if (!text || !text.trim()) return null;
  return <div className={`rich ${className}`.trim()}>{renderRich(text)}</div>;
}
