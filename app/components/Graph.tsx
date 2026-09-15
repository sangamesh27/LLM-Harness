"use client";

import { useEffect, useRef, useState } from "react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";

export interface GraphNode {
  handle: string;
  uniqueReach: number;
  recommended: boolean;
  redundant: boolean;
}
export interface GraphEdge {
  a: string;
  b: string;
  overlapPct: number;
}

interface SimNode extends SimulationNodeDatum {
  handle: string;
  uniqueReach: number;
  recommended: boolean;
  redundant: boolean;
  radius: number;
}
interface SimLink extends SimulationLinkDatum<SimNode> {
  overlapPct: number;
}

export function Graph({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 800, height: 520 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = size;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    const maxReach = Math.max(1, ...nodes.map((n) => n.uniqueReach));
    const simNodes: SimNode[] = nodes.map((n) => ({
      ...n,
      radius: 5 + (n.uniqueReach / maxReach) * 20,
    }));
    const nodeByHandle = new Map(simNodes.map((n) => [n.handle, n]));
    const simLinks: SimLink[] = edges
      .filter((e) => nodeByHandle.has(e.a) && nodeByHandle.has(e.b))
      .map((e) => ({ source: e.a, target: e.b, overlapPct: e.overlapPct }));

    const simulation = forceSimulation(simNodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.handle)
          .distance((l) => 220 - l.overlapPct)
          .strength(0.12)
      )
      .force("charge", forceManyBody().strength(-110))
      .force("center", forceCenter(width / 2, height / 2))
      .force(
        "collide",
        forceCollide<SimNode>().radius((d) => d.radius + 6)
      )
      .on("tick", draw);

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);

      for (const link of simLinks) {
        const s = link.source as SimNode;
        const t = link.target as SimNode;
        if (typeof s.x !== "number" || typeof t.x !== "number") continue;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y!);
        ctx.lineTo(t.x, t.y!);
        ctx.strokeStyle = `rgba(148,163,184,${Math.min(0.55, 0.15 + link.overlapPct / 150)})`;
        ctx.lineWidth = Math.max(0.6, link.overlapPct / 18);
        ctx.stroke();
      }

      for (const n of simNodes) {
        if (typeof n.x !== "number") continue;
        const x = n.x;
        const y = n.y!;

        ctx.beginPath();
        ctx.arc(x, y, n.radius, 0, Math.PI * 2);
        ctx.globalAlpha = n.redundant ? 0.32 : 1;
        ctx.fillStyle = n.recommended ? "#2563eb" : n.redundant ? "#94a3b8" : "#64748b";
        ctx.fill();
        if (n.recommended) {
          ctx.lineWidth = 2;
          ctx.strokeStyle = "#1d4ed8";
          ctx.stroke();
        }
        ctx.globalAlpha = 1;

        ctx.fillStyle = "#334155";
        ctx.font = n.recommended ? "bold 10px system-ui, sans-serif" : "10px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(n.handle, x, y + n.radius + 11);
      }
    }

    return () => {
      simulation.stop();
    };
  }, [nodes, edges, size]);

  return (
    <div ref={containerRef} className="h-full w-full">
      <canvas ref={canvasRef} />
    </div>
  );
}
