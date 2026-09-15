import type { DecisionLogEntry } from "@/src/export/snapshot";

function summarize(entry: DecisionLogEntry): string {
  const r = entry.resultSummary;
  if (r && typeof r === "object") {
    const obj = r as Record<string, unknown>;
    if ("postsReturned" in obj) return `${obj.postsReturned} posts returned`;
    if ("engagersWritten" in obj) return `${obj.engagersWritten} engagements recorded`;
    if ("candidates" in obj && Array.isArray(obj.candidates)) return `${obj.candidates.length} candidates found`;
    if ("lineup" in obj && Array.isArray(obj.lineup)) return `${obj.lineup.length}-creator lineup computed`;
    if ("accepted" in obj) return obj.accepted ? "report accepted" : `rejected: ${String(obj.reason)}`;
  }
  return "";
}

export function DecisionLog({ entries }: { entries: DecisionLogEntry[] }) {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {entries.map((entry) => (
        <div key={entry.seq} className="border-b border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs font-semibold text-blue-700 dark:text-blue-400">
              {entry.toolName}
            </span>
            <span className="text-xs text-zinc-400">#{entry.seq}</span>
          </div>
          {entry.reasoning && (
            <p className="mt-1 whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">{entry.reasoning}</p>
          )}
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">{summarize(entry)}</p>
        </div>
      ))}
    </div>
  );
}
