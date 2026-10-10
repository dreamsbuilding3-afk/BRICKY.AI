"use client";

const REEL_DIGITS = Array.from({ length: 40 }, (_, i) => i % 10);

function Reel({ digit, index, dim }: { digit: number; index: number; dim: boolean }) {
  return (
    <div className={"odo-cell" + (dim ? " odo-cell-dim" : "")} aria-hidden="true">
      <div
        className="odo-reel"
        style={{
          ["--d" as any]: digit,
          ["--delay" as any]: `${index * 140}ms`,
          ["--dur" as any]: `${1.5 + index * 0.25}s`,
        }}
      >
        {REEL_DIGITS.map((n, i) => <span key={i}>{n}</span>)}
      </div>
    </div>
  );
}

export function AnalysesCounter({ value }: { value: number }) {
  const str = String(Math.max(0, Math.floor(value)));
  const cells = Math.max(3, str.length);
  const padded = str.padStart(cells, "0");
  const lead = cells - str.length;
  return (
    <section className="odo-card" key={str}>
      <div className="odo-copy">
        <span className="odo-label">Bricky en chiffres</span>
        <b className="odo-title">Analyses réalisées</b>
        <span className="odo-sub">sur la plateforme</span>
      </div>
      <div className="odo-screen" role="img" aria-label={str + (value > 1 ? " analyses réalisées" : " analyse réalisée")}>
        {padded.split("").map((ch, i) => <Reel key={i} digit={Number(ch)} index={i} dim={i < lead} />)}
      </div>
    </section>
  );
}
