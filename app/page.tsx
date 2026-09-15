import snapshotData from "../public/snapshot.json";
import type { Snapshot } from "@/src/export/snapshot";
import { Graph } from "./components/Graph";
import { DecisionLog } from "./components/DecisionLog";

const snapshot = snapshotData as unknown as Snapshot;

export default function Home() {

  return (
    <div className="flex flex-col bg-zinc-50 dark:bg-black lg:h-screen lg:overflow-hidden">
      {/* Region 1: headline insight */}
      <header className="shrink-0 border-b border-zinc-200 bg-white px-8 py-10 dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
          Creator overlap mapper
        </p>
        <h1 className="mt-3 max-w-4xl text-3xl font-bold leading-tight tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
          {snapshot.headline}
        </h1>
        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-zinc-500 dark:text-zinc-400">
          <span>{snapshot.stats.creatorsTracked} creators tracked</span>
          {snapshot.stats.toolCallsUsed !== null && <span>{snapshot.stats.toolCallsUsed} agent tool calls</span>}
          {snapshot.stats.totalCostUsd !== null && (
            <span>${snapshot.stats.totalCostUsd!.toFixed(2)} total Claude API cost</span>
          )}
          <span>generated {new Date(snapshot.generatedAt).toLocaleString()}</span>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-6 p-6 lg:min-h-0 lg:flex-row">
        {/* Region 2: force-directed graph */}
        <section className="flex flex-1 flex-col overflow-y-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Audience overlap graph</h2>
            <div className="flex items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full border-2 border-blue-700 bg-blue-600" /> recommended
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-slate-400 opacity-40" /> redundant
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-slate-500" /> other
              </span>
            </div>
          </div>
          <div className="h-[480px] shrink-0 p-2">
            <Graph
              nodes={snapshot.nodes.map((n) => ({
                handle: n.handle,
                uniqueReach: n.uniqueReach,
                recommended: n.recommended,
                redundant: n.redundant,
              }))}
              edges={snapshot.edges}
            />
          </div>

          {/* Recommended lineup + redundant pairs, beneath the graph */}
          <div className="grid grid-cols-1 gap-4 border-t border-zinc-200 p-4 dark:border-zinc-800 sm:grid-cols-2">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Recommended lineup
              </h3>
              <ol className="mt-2 space-y-1 text-sm">
                {snapshot.recommendedLineup.map((c) => (
                  <li key={c.handle} className="flex items-center justify-between gap-2">
                    <span className="font-medium text-zinc-800 dark:text-zinc-200">{c.handle}</span>
                    <span className="text-zinc-500 dark:text-zinc-400">
                      +{c.marginalGainPct.toFixed(1)}% ({c.uniqueReach})
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Most redundant pairs
              </h3>
              <ol className="mt-2 space-y-1 text-sm">
                {snapshot.redundantPairs
                  .slice()
                  .sort((a, b) => b.overlapPct - a.overlapPct)
                  .slice(0, 8)
                  .map((p) => (
                    <li key={`${p.a}-${p.b}`} className="flex items-center justify-between gap-2">
                      <span className="text-zinc-800 dark:text-zinc-200">
                        {p.a} / {p.b}
                      </span>
                      <span className="text-zinc-500 dark:text-zinc-400">{p.overlapPct.toFixed(0)}%</span>
                    </li>
                  ))}
              </ol>
            </div>
          </div>

          {(snapshot.hookStyleFinding || snapshot.dataCaveats) && (
            <div className="space-y-3 border-t border-zinc-200 p-4 text-sm dark:border-zinc-800">
              {snapshot.hookStyleFinding && (
                <p>
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">Hook style finding: </span>
                  <span className="text-zinc-600 dark:text-zinc-400">{snapshot.hookStyleFinding}</span>
                </p>
              )}
              {snapshot.dataCaveats && (
                <p>
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">Data caveats: </span>
                  <span className="text-zinc-600 dark:text-zinc-400">{snapshot.dataCaveats}</span>
                </p>
              )}
            </div>
          )}
        </section>

        {/* Region 3: agent decision log -- never in a tab */}
        <aside className="flex h-[600px] w-full shrink-0 flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 lg:h-auto lg:w-[420px]">
          <div className="shrink-0 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Agent decision log</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{snapshot.decisionLog.length} tool calls, in order</p>
          </div>
          <div className="min-h-0 flex-1">
            <DecisionLog entries={snapshot.decisionLog} />
          </div>
        </aside>
      </main>
    </div>
  );
}
