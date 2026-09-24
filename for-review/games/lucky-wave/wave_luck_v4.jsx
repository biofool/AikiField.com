import { useState, useEffect, useRef, useCallback } from "react";

// ── Colorblind-safe score palette (Okabe-Ito based)
// Distinguishable for deuteranopia, protanopia, and tritanopia.
// Each score also has a unique shape symbol — never color alone.
const SCORES = [
  { v: 1, label: "Skipped", short: "Skip",    color: "#94A3B8", symbol: "—",  bg: "#1A2030" },
  { v: 2, label: "Barely",  short: "Barely",  color: "#FB923C", symbol: "◐",  bg: "#2A1A08" },
  { v: 3, label: "Partial", short: "Partial", color: "#60A5FA", symbol: "◑",  bg: "#081828" },
  { v: 4, label: "Solid",   short: "Solid",   color: "#A78BFA", symbol: "◕",  bg: "#180E2A" },
  { v: 5, label: "Full",    short: "Full",    color: "#34D399", symbol: "●",  bg: "#082218" },
];

const PHASES = [
  {
    id: "activate", label: "Activate", emoji: "⚡", color: "#00C9B8", seconds: 35,
    components: ["Posture & Alignment", "State Interruption"],
    instruction: [
      "Elongate your entire body from toes to crown — imagine being pulled in two directions simultaneously. Long bones, short bones, spine, fascia — everything extending.",
      "Shake your hands hard — like flicking water off your fingertips. Let it spread to your whole body: bounce, swing your arms, let your head roll if safe. Get the energy moving through every cell."
    ],
    cue: "Your body is the antenna. Whatever state you held before is gone.",
  },
  {
    id: "access", label: "Access", emoji: "✨", color: "#B89EE8", seconds: 50,
    components: ["Lucky Memory Recall", "Power Breathing"],
    instruction: [
      "Recall a moment when everything went your way. See it through your own eyes. Hear exactly what you heard. Feel what you felt. Make the image bigger, brighter, closer — intensify every sensation.",
      "Three power breaths: massive inhale → hold → explode out through your mouth. On the last round, draw golden energy up from the earth. Release with any sound — a groan, a shout."
    ],
    cue: "You're not just remembering luck — you're generating its frequency right now.",
  },
  {
    id: "declare", label: "Declare", emoji: "📢", color: "#F4C842", seconds: 50,
    components: ["Spoken Affirmation", "Anchor Stacking"],
    instruction: [
      "Out loud — command voice: \"I am a wave generator. My energy moves mountains. Fortune flows through me. I attract synchronicity. Today is my day. The universe says yes to me. I ride the lucky wave.\" Again. Louder.",
      "Three rounds — maximum intensity: clench fist → tongue to roof of mouth → power stance → shout: \"I ride the wave of fortune. I am momentum.\" This is your neurological switch — it belongs to you now."
    ],
    cue: "Anytime today: fist + tongue + stance = instant access to this peak state.",
  },
  {
    id: "launch", label: "Launch", emoji: "🌊", color: "#F47C42", seconds: 45,
    components: ["Future Vision", "Intention", "Pre-Celebration"],
    instruction: [
      "Close your eyes. See your calendar stretching ahead — each day glowing with golden energy, each one its own wave of luck, lined up and waiting.",
      "Identify ONE thing that would make today wildly successful. See it clearly. Feel what it would feel like to already have it.",
      "Smile — actually smile, right now. Pre-celebrate. Let gratitude flood through you for fortune that's already in motion."
    ],
    cue: "One perfect day becomes two. Riding the lucky wave is becoming who you are.",
  },
];

const TOTAL = 180;
const fmt = s => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
const scoreFor = v => SCORES.find(s => s.v === v);

// ── Contrast-safe text tokens (all ≥ 4.5:1 on #070C1A) ──────────────
const T = {
  primary:   "#E8EAF0",   // ~17:1
  secondary: "#A8B4C8",   // ~7.5:1  — replaces all rgba(255,255,255,0.3-0.45)
  muted:     "#7C8A9E",   // ~4.6:1  — minimum; use only for large/bold text
  hint:      "#8A96AA",   // ~5.2:1  — captions, fine print at 12px+
};

export default function App() {
  const [screen, setScreen]       = useState("intro");
  const [queue, setQueue]         = useState(PHASES);
  const [idx, setIdx]             = useState(0);
  const [totalLeft, setTotalLeft] = useState(TOTAL);
  const [stepLeft, setStepLeft]   = useState(PHASES[0].seconds);
  const [scores, setScores]       = useState({});
  const [review, setReview]       = useState("");
  const [loading, setLoading]     = useState(false);

  const tTotal = useRef(null);
  const tStep  = useRef(null);
  const qRef   = useRef(queue);
  const iRef   = useRef(idx);
  useEffect(() => { qRef.current = queue; }, [queue]);
  useEffect(() => { iRef.current = idx;   }, [idx]);

  const stopAll = useCallback(() => {
    clearInterval(tTotal.current);
    clearInterval(tStep.current);
  }, []);

  useEffect(() => {
    if (screen !== "exercise") return;
    tTotal.current = setInterval(() => {
      setTotalLeft(t => { if (t <= 1) { stopAll(); setScreen("score"); return 0; } return t - 1; });
    }, 1000);
    return () => clearInterval(tTotal.current);
  }, [screen, stopAll]);

  useEffect(() => {
    if (screen !== "exercise") return;
    clearInterval(tStep.current);
    tStep.current = setInterval(() => {
      setStepLeft(t => {
        if (t <= 1) {
          clearInterval(tStep.current);
          const next = iRef.current + 1;
          if (next >= qRef.current.length) { stopAll(); setTimeout(() => setScreen("score"), 50); }
          else { setIdx(next); setStepLeft(qRef.current[next].seconds); }
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(tStep.current);
  }, [screen, idx, stopAll]);

  const begin = useCallback((phases = PHASES) => {
    stopAll();
    setQueue(phases);
    setIdx(0);
    setTotalLeft(TOTAL);
    setStepLeft(phases[0].seconds);
    setReview("");
    setScreen("exercise");
  }, [stopAll]);

  const handleNext = () => {
    stopAll();
    const next = idx + 1;
    if (next >= queue.length) setScreen("score");
    else { setIdx(next); setStepLeft(queue[next].seconds); }
  };

  const submitScores = async () => {
    setLoading(true);
    setScreen("result");
    const lines = PHASES.map(p => `${p.label}: ${scores[p.id]||0}/5 (${scoreFor(scores[p.id])?.label || "unrated"})`).join(", ");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 500,
          system: "You are a somatic activation coach for 'Ride the Lucky Wave' (4 phases: Activate, Access, Declare, Launch). Comment ONLY on phases scored 1–3. Skip 4–5 entirely. Under 140 words. No bullets, no headers. Warm, direct, energizing. End with one sentence naming the single phase to prioritize on a repeat.",
          messages: [{ role: "user", content: `Compliance: ${lines}` }]
        })
      });
      const d = await res.json();
      setReview(d.content?.[0]?.text || "");
    } catch {
      setReview("Even partial activation shifts the field. Your nervous system responds to intention as much as perfect execution — keep riding.");
    }
    setLoading(false);
  };

  const allRated = PHASES.every(p => scores[p.id]);

  // ── Shared styles ──────────────────────────────────────────────────
  const S = {
    page:  { background: "#070C1A", minHeight: "100dvh", color: T.primary, fontFamily: "system-ui, -apple-system, sans-serif", overflowY: "auto" },
    inner: { maxWidth: 480, margin: "0 auto", padding: "0 16px 52px" },
    card:  { background: "#0E1525", border: "1px solid #1E2A3D", borderRadius: 18, padding: "18px 16px", marginBottom: 14 },
    btnPri: {
      display: "block", width: "100%", padding: "18px 0", borderRadius: 14, border: "none",
      background: "linear-gradient(135deg,#F4C842,#E89020)", color: "#080C18",
      fontSize: 15, fontWeight: 800, letterSpacing: "0.08em", cursor: "pointer",
      textTransform: "uppercase", fontFamily: "inherit",
    },
    btnSec: {
      display: "block", width: "100%", padding: "15px 0", borderRadius: 14,
      border: "1px solid #2A3A52", background: "transparent",
      color: T.secondary, fontSize: 13, fontWeight: 600,
      letterSpacing: "0.06em", cursor: "pointer",
      textTransform: "uppercase", fontFamily: "inherit", marginTop: 10,
    },
    label: { fontSize: 11, letterSpacing: "0.13em", textTransform: "uppercase", color: T.hint },
  };

  // ── INTRO ──────────────────────────────────────────────────────────
  if (screen === "intro") return (
    <div style={S.page}>
      <div style={{ ...S.inner, paddingTop: 44 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 52, marginBottom: 14 }}>🌊</div>
          <h1 style={{ fontFamily: "Georgia, serif", fontSize: 36, fontWeight: 300, color: "#F4C842", margin: "0 0 10px", lineHeight: 1.1 }}>
            Ride the Lucky Wave
          </h1>
          <div style={{ ...S.label, color: T.secondary }}>3-minute nervous system activation</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 22 }}>
          {PHASES.map(p => (
            <div key={p.id} style={{ ...S.card, marginBottom: 0, textAlign: "center", borderColor: p.color + "55", padding: "16px 10px" }}>
              <div style={{ fontSize: 26, marginBottom: 6 }}>{p.emoji}</div>
              <div style={{ fontWeight: 800, fontSize: 14, color: p.color, marginBottom: 4 }}>{p.label}</div>
              <div style={{ fontSize: 12, color: T.secondary }}>{p.seconds}s</div>
            </div>
          ))}
        </div>

        <div style={{ ...S.card, marginBottom: 24 }}>
          <p style={{ fontFamily: "Georgia, serif", fontSize: 17, lineHeight: 1.8, margin: 0, color: T.secondary, fontStyle: "italic" }}>
            Move, breathe, declare, launch — then self-report so the practice adapts to what you need most.
          </p>
        </div>

        <button style={S.btnPri} onClick={() => begin()}>Begin Activation</button>
        <p style={{ textAlign: "center", fontSize: 12, color: T.hint, marginTop: 14 }}>
          Find a space to move, speak aloud, and breathe freely
        </p>
      </div>
    </div>
  );

  // ── EXERCISE ───────────────────────────────────────────────────────
  if (screen === "exercise") {
    const phase = queue[idx];
    const pct   = Math.min(((phase.seconds - stepLeft) / phase.seconds) * 100, 100);
    const tpct  = ((TOTAL - totalLeft) / TOTAL) * 100;
    const urgent = totalLeft <= 20;

    return (
      <div style={{ ...S.page, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "14px 18px 10px", borderBottom: "1px solid #1A2438", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
            {queue.map((p, i) => (
              <div key={p.id} style={{
                height: 7, width: i === idx ? 26 : 7, borderRadius: 4,
                background: i < idx ? "#F4C842" : i === idx ? p.color : "#1E2A3D",
                transition: "all 0.35s",
              }} />
            ))}
          </div>
          <div style={{
            fontVariantNumeric: "tabular-nums", fontSize: 32, fontWeight: 200, lineHeight: 1,
            color: urgent ? "#FB923C" : "#F4C842",
            transition: "color 0.5s",
          }}>{fmt(totalLeft)}</div>
        </div>

        <div style={{ height: 3, background: "#1A2438" }}>
          <div style={{ height: "100%", width: `${tpct}%`, background: `linear-gradient(90deg,${phase.color},#F4C842)`, transition: "width 1s linear" }} />
        </div>

        <div style={{ ...S.inner, flex: 1, paddingTop: 22, display: "flex", flexDirection: "column" }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 34, marginBottom: 8 }}>{phase.emoji}</div>
            <div style={{ fontWeight: 800, fontSize: 22, color: phase.color, marginBottom: 6 }}>{phase.label}</div>
            <div style={{ ...S.label, color: T.secondary }}>{phase.components.join(" · ")}</div>
          </div>

          <div style={{ flex: 1 }}>
            {phase.instruction.map((txt, i) => (
              <div key={i} style={{ display: "flex", gap: 12, marginBottom: 20 }}>
                <div style={{
                  minWidth: 26, height: 26, borderRadius: "50%",
                  background: phase.color + "25", border: `2px solid ${phase.color}80`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 800, fontSize: 12, color: phase.color, flexShrink: 0, marginTop: 2,
                }}>{i + 1}</div>
                <p style={{ fontSize: 17, lineHeight: 1.8, margin: 0, color: T.primary, fontFamily: "Georgia, serif" }}>{txt}</p>
              </div>
            ))}
            <div style={{ borderLeft: `2px solid ${phase.color}50`, paddingLeft: 14, marginTop: 4 }}>
              <p style={{ fontSize: 15, lineHeight: 1.7, margin: 0, color: T.secondary, fontStyle: "italic", fontFamily: "Georgia, serif" }}>
                {phase.cue}
              </p>
            </div>
          </div>

          <div style={{ marginTop: 28 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ ...S.label, color: T.hint }}>Phase timer</span>
              <span style={{ ...S.label, color: T.secondary, fontWeight: 700 }}>{stepLeft}s</span>
            </div>
            <div style={{ background: "#1A2438", borderRadius: 4, height: 5, overflow: "hidden", marginBottom: 18 }}>
              <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg,${phase.color},#F4C842)`, transition: "width 1s linear", borderRadius: 4 }} />
            </div>
            <button style={S.btnPri} onClick={handleNext}>
              {idx >= queue.length - 1 ? "Complete → Review" : `Next: ${queue[idx + 1]?.label} →`}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── SCORE TABLE ────────────────────────────────────────────────────
  if (screen === "score") {
    const rated = PHASES.filter(p => scores[p.id]).length;

    return (
      <div style={S.page}>
        <div style={{ ...S.inner, paddingTop: 36 }}>

          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🌊</div>
            <h1 style={{ fontFamily: "Georgia, serif", fontSize: 32, fontWeight: 300, color: "#F4C842", margin: "0 0 8px" }}>
              How did you ride?
            </h1>
            <p style={{ fontSize: 14, color: T.secondary, margin: 0 }}>
              Tap your compliance for each phase
            </p>
          </div>

          {/* Legend */}
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14, padding: "0 4px" }}>
            {SCORES.map(s => (
              <div key={s.v} style={{ textAlign: "center", flex: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.symbol}</div>
                <div style={{ fontSize: 11, color: s.color, marginTop: 4, fontWeight: 700 }}>{s.short}</div>
              </div>
            ))}
          </div>

          {/* Phase rows */}
          <div style={{ borderRadius: 18, overflow: "hidden", border: "1px solid #1E2A3D" }}>
            {PHASES.map((phase, ri) => {
              const sel   = scores[phase.id];
              const sObj  = scoreFor(sel);

              return (
                <div key={phase.id} style={{
                  borderBottom: ri < PHASES.length - 1 ? "1px solid #1E2A3D" : "none",
                  background: sel ? sObj.bg : "#0E1525",
                  transition: "background 0.2s",
                }}>
                  {/* Phase header */}
                  <div style={{ padding: "14px 16px 10px", display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 22 }}>{phase.emoji}</span>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 16, color: sel ? sObj.color : phase.color, transition: "color 0.2s" }}>
                        {phase.label}
                      </div>
                      <div style={{ fontSize: 12, color: T.secondary, marginTop: 2 }}>
                        {phase.components.join(" · ")}
                      </div>
                    </div>
                    {sel && (
                      <div style={{ marginLeft: "auto", textAlign: "right" }}>
                        <div style={{ fontSize: 26, fontWeight: 900, color: sObj.color, lineHeight: 1 }}>{sObj.symbol}</div>
                        <div style={{ fontSize: 11, color: sObj.color, marginTop: 2, fontWeight: 700 }}>{sObj.label}</div>
                      </div>
                    )}
                  </div>

                  {/* Score buttons */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6, padding: "0 12px 14px" }}>
                    {SCORES.map(s => {
                      const active = sel === s.v;
                      return (
                        <button key={s.v} onClick={() => setScores(sc => ({ ...sc, [phase.id]: s.v }))}
                          aria-label={`${phase.label}: ${s.label}`}
                          aria-pressed={active}
                          style={{
                            border: `2px solid ${active ? s.color : "#2A3A52"}`,
                            borderRadius: 12,
                            background: active ? s.color + "20" : "transparent",
                            padding: "10px 0",
                            cursor: "pointer",
                            display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                            transition: "all 0.15s",
                            outline: active ? `2px solid ${s.color}` : "none",
                            outlineOffset: 2,
                          }}>
                          <span style={{ fontSize: 20, color: active ? s.color : T.secondary, fontWeight: 900, lineHeight: 1 }}>
                            {s.symbol}
                          </span>
                          <span style={{ fontSize: 10, color: active ? s.color : T.secondary, fontWeight: active ? 700 : 400, letterSpacing: "0.04em" }}>
                            {s.short}
                          </span>
                          <span style={{ fontSize: 16, fontWeight: 900, color: active ? s.color : T.hint, lineHeight: 1 }}>
                            {s.v}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Progress */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "16px 4px 20px" }}>
            <div style={{ display: "flex", gap: 8 }}>
              {PHASES.map(p => {
                const s = scoreFor(scores[p.id]);
                return (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{
                      width: 10, height: 10, borderRadius: "50%",
                      background: s ? s.color : "#2A3A52",
                      transition: "background 0.2s",
                    }} />
                    <span style={{ fontSize: 10, color: s ? s.color : T.hint, fontWeight: s ? 700 : 400 }}>
                      {p.label}
                    </span>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 13, color: T.secondary, fontWeight: 600 }}>
              {rated}/{PHASES.length}
            </div>
          </div>

          <button style={{ ...S.btnPri, opacity: allRated ? 1 : 0.35, cursor: allRated ? "pointer" : "default" }}
            onClick={allRated ? submitScores : undefined}>
            Get Coaching Review →
          </button>
          {!allRated && (
            <p style={{ textAlign: "center", fontSize: 13, color: T.secondary, marginTop: 10 }}>
              Rate all 4 phases to continue
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── RESULT ─────────────────────────────────────────────────────────
  if (screen === "result") {
    const low = PHASES.filter(p => (scores[p.id] || 0) < 3);
    const avg = (PHASES.reduce((a, p) => a + (scores[p.id] || 0), 0) / PHASES.length).toFixed(1);

    return (
      <div style={S.page}>
        <div style={{ ...S.inner, paddingTop: 32 }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <h1 style={{ fontFamily: "Georgia, serif", fontSize: 30, fontWeight: 300, color: "#F4C842", margin: "0 0 6px" }}>
              Your Wave Report
            </h1>
            <div style={{ fontSize: 14, color: T.secondary }}>Average compliance: {avg} / 5</div>
          </div>

          {/* Result rows */}
          <div style={{ borderRadius: 18, overflow: "hidden", border: "1px solid #1E2A3D", marginBottom: 20 }}>
            {PHASES.map((p, i) => {
              const v    = scores[p.id] || 0;
              const sObj = scoreFor(v);
              return (
                <div key={p.id} style={{
                  display: "flex", alignItems: "center", gap: 14, padding: "16px",
                  borderBottom: i < PHASES.length - 1 ? "1px solid #1E2A3D" : "none",
                  background: sObj ? sObj.bg : "#0E1525",
                }}>
                  <div style={{ fontSize: 28 }}>{p.emoji}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 17, color: p.color }}>{p.label}</div>
                    <div style={{ fontSize: 12, color: T.secondary, marginTop: 3 }}>{p.components.join(" · ")}</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 32, color: sObj?.color || T.secondary, fontWeight: 900, lineHeight: 1 }}>
                      {sObj?.symbol || "—"}
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: sObj?.color || T.secondary, lineHeight: 1.2 }}>
                      {v}
                    </div>
                    <div style={{ fontSize: 12, color: sObj?.color || T.secondary, fontWeight: 700, marginTop: 2 }}>
                      {sObj?.label || "—"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* AI coaching */}
          <div style={{ ...S.card, marginBottom: 20 }}>
            {loading ? (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>🌊</div>
                <div style={{ fontSize: 14, color: T.secondary }}>Reading your wave...</div>
              </div>
            ) : (
              <>
                <div style={{ ...S.label, color: "#00C9B8", marginBottom: 12 }}>Coaching</div>
                <p style={{ fontFamily: "Georgia, serif", fontSize: 17, lineHeight: 1.85, margin: 0, color: T.primary, fontStyle: "italic" }}>
                  {review}
                </p>
              </>
            )}
          </div>

          {!loading && (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {low.length > 0 && (
                <button style={S.btnPri} onClick={() => begin(low)}>
                  Repeat Low Phases — {low.map(p => p.emoji).join(" ")}
                </button>
              )}
              <button style={S.btnSec} onClick={() => begin(PHASES)}>Repeat Full Exercise</button>
              <button style={S.btnSec} onClick={() => setScreen("intro")}>Done for Now</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
