import { cn } from "@/lib/utils";

/**
 * Renders untrusted text safely: paragraphs, "##" headings and "- " lists only. Everything is a React
 * text node, never HTML, so imported content cannot inject markup.
 */
export function PlainText({ text, className }: { text: string; className?: string }) {
  const blocks = text.split(/\n{2,}/).slice(0, 5000);
  return (
    <div className={cn("space-y-3 text-sm leading-relaxed", className)} dir="auto">
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {lines.map((l, j) => (
                <li key={j}>{l.replace(/^\s*[-*•]\s+/, "")}</li>
              ))}
            </ul>
          );
        }
        const heading = /^(#{1,6})\s+(.*)$/.exec(block);
        if (heading && lines.length === 1) {
          return (
            <h3 key={i} className="pt-2 text-base font-semibold">
              {heading[2]}
            </h3>
          );
        }
        return (
          <p key={i} className="whitespace-pre-line">
            {block}
          </p>
        );
      })}
    </div>
  );
}
