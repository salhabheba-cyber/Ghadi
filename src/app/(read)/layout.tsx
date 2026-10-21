import { ReadLangProvider } from "@/lib/read/lang";

export default function ReadGroupLayout({ children }: { children: React.ReactNode }) {
  return <ReadLangProvider>{children}</ReadLangProvider>;
}
