import { permanentRedirect } from "next/navigation";

// Collections are now Bundles.
export default function CollectionsRedirect() { permanentRedirect("/bundles"); }
