const SCORES = [
  { v: 1, label: "Skipped", short: "Skip", color: "#94A3B8", symbol: "—", bg: "#1A2030" },
  { v: 2, label: "Barely", short: "Barely", color: "#FB923C", symbol: "◐", bg: "#2A1A08" },
  { v: 3, label: "Partial", short: "Partial", color: "#60A5FA", symbol: "◑", bg: "#081828" },
  { v: 4, label: "Solid", short: "Solid", color: "#A78BFA", symbol: "◕", bg: "#180E2A" },
  { v: 5, label: "Full", short: "Full", color: "#34D399", symbol: "●", bg: "#082218" },
];

const SCORES_RMOONE = [
  { v: 1, label: "Absent", short: "Absent", color: "#94A3B8", symbol: "—", bg: "#1A2030" },
  { v: 2, label: "Stirring", short: "Stir", color: "#FB923C", symbol: "◐", bg: "#2A1A08" },
  { v: 3, label: "Blending", short: "Blend", color: "#60A5FA", symbol: "◑", bg: "#081828" },
  { v: 4, label: "Flowing", short: "Flow", color: "#A78BFA", symbol: "◕", bg: "#180E2A" },
  { v: 5, label: "Unified-Field", short: "Aiki", color: "#34D399", symbol: "●", bg: "#082218" },
];

const PHASES = [
  {
    id: "activate", label: "Activate", emoji: "⚡", color: "#00C9B8", seconds: 35,
    components: ["Posture & Alignment", "State Interruption"],
    instruction: [
      "Elongate your entire body from toes to crown — imagine being pulled in two directions simultaneously. Long bones, short bones, spine, fascia, nerves — everything extending.",
      "Shake your hands hard — like flicking water off your fingertips. Let it spread to your whole body: bounce, swing your arms, let your head roll if safe. Get the energy moving through every cell."
    ],
    cue: "Your body is the antenna. Whatever state you held before is gone.",
  },
  {
    id: "access", label: "Access", emoji: "✨", color: "#B89EE8", seconds: 50,
    components: ["Lucky Memory Recall", "Power Breathing"],
    instruction: [
      "Recall a moment when things were 📢going your way📢. See it through your own eyes. Hear exactly what you heard. Feel what you felt. Make the image bigger, brighter, closer — intensify every sensation.",
      "Three power breaths: massive inhale → hold → explode out through your mouth. On the last round, draw golden energy up from the earth. Release with any sound — a groan, a shout."
    ],
    cue: "You're not just remembering luck — you're generating its frequency right now.",
  },
  {
    id: "declare", label: "Declare", emoji: "📢", color: "#F4C842", seconds: 50,
    components: ["Spoken Affirmation", "Anchor Stacking"],
    instruction: [
      'Out loud — command voice: "I am a wave generator. I stay sharp and alert. More breaks my way when I\'m in this state. I move through friction. The odds tilt in my favor. I ride the lucky wave." Again. Louder.',
      'Three rounds — maximum intensity: clench fist → tongue to roof of mouth → power stance → shout: "I ride the wave of fortune. I am momentum." This is your neurological switch — it belongs to you now.'
    ],
    cue: "Anytime today: fist + tongue + stance = instant access to this peak state.",
  },
  {
    id: "launch", label: "Launch", emoji: "🌊", color: "#F47C42", seconds: 45,
    components: ["Future Vision", "Intention", "Pre-Celebration"],
    instruction: [
      "Close your eyes. See your calendar stretching ahead — each day glowing with golden energy, each one its own wave of luck, lined up and waiting.",
      "Identify ONE thing that would make today successful. See it clearly. Feel what it would feel like to already have it.",
      "Smile — actually smile, right now. Pre-celebrate. Let gratitude flood through you for fortune that's already in motion."
    ],
    cue: "More breaks your way today than yesterday. Keep showing up and the odds keep tilting.",
  },
];

// ── RMOONE PHASES — language derived from R. Moon's books ─────────
const PHASES_RMOONE = [
  {
    id: "activate", label: "Center", emoji: "⚡", color: "#00C9B8", seconds: 35,
    components: ["centered, grounded", "world of duality"],
    instruction: [
      "Feel where you are — from toes to crown, from earth to sky. Let your weight pour into the ground. Elongate. Zanshin: extend your attention through time-space in both directions at once. Long bones, short bones, spine, fascia — one unified field of Ki.",
      "Shake your hands as if flicking water from your fingertips. Let the shaking spread — bounce, swing, let the head roll if it is safe. This is the Thalamic Pause in motion: interrupt the world of duality and return to Unified-Field."
    ],
    cue: "You can't get there from not-here. You are here. The Ki you held before dissolves into presence.",
  },
  {
    id: "access", label: "Attune", emoji: "✨", color: "#B89EE8", seconds: 50,
    components: ["free-flowing awareness", "Kokyu breath"],
    instruction: [
      "Enter Unified-Field in memory: recall a moment when the Ki was flowing freely — when you were non-resistant, fluid, alive. See it through your own eyes. Hear exactly what you heard in that place. Feel the unified field. Make the image bigger, brighter — intensify the felt sense until it moves through you now.",
      "Three Kokyu breaths — draw Ki up from the earth on the inhale, hold, then release through the mouth with any sound your spirit calls for. On the final breath, sense the golden energy of the universal field rising through you. Let it flood every cell."
    ],
    cue: "You are not remembering — you are generating the frequency of Unified-Field right now. The whisperings are already here.",
  },
  {
    id: "declare", label: "Voice the Ki", emoji: "📢", color: "#F4C842", seconds: 50,
    components: ["Authentic Voice", "reciprocating echo"],
    instruction: [
      'Share who you are — out loud, from your center. This is the third principle: when you are present and non-resistant, your contribution flows freely. Command voice: "I am the unified field. Ki flows through me. I move in harmonious relationship with fortune. I share who I am. I ride the lucky wave." Again — louder and truer each time.',
      'Three rounds — maximum presence: clench fist → tongue to roof of mouth → Aiki stance → speak from your center: "I ride the wave of fortune. I am Take Musu — infinite creativity in motion." This is your somatic anchor. It belongs to you now — body, mind, spirit.'
    ],
    cue: "Anytime today: fist + tongue + stance = instant return to Aiki-land. This is the way of loving protection.",
  },
  {
    id: "launch", label: "Take Musu", emoji: "🌊", color: "#F47C42", seconds: 45,
    components: ["whisperings of the Kami", "bestowed mission", "divine creation"],
    instruction: [
      "Close your eyes. See the river stretching ahead — each day is a wave of Ki, lined up and flowing, one system of divine creation. Listen for the whisperings of the Kami. They are always present. The mystery is infinite.",
      "Identify the ONE act that would complete your bestowed mission today. See it clearly. Feel the unified field receiving it. You are not working toward it — you are already moving in harmonious relationship with it.",
      "Smile — let it rise naturally. Pre-celebrate with Aiki gratitude. Bow deeply to the universe and feel it bow back. Fortune that is already in motion needs only your non-resistant presence."
    ],
    cue: "The wind is already blowing. Set your sails in harmony with it. The odds tilt when you live in Unified-Field.",
  },
];

const UI_STRINGS = {
  rmoone: {
    title: "Ride the Lucky Wave",
    subtitle: "3-minute Ki activation",
    intro: "Center, attune, declare, launch — then self-report so the practice aligns with what the Kami is whispering.",
    begin: "Begin Ki Activation",
    beginHint: "Find a space to move, speak aloud, and breathe freely — feel where you are",
    scoreTitle: "How did you ride the wave of Ki?",
    scoreSub: "Tap your felt sense for each phase",
    resultTitle: "Your Aiki-Wave Report",
    resultSub: "Average Ki compliance",
    coaching: "Whisperings",
    loading: "Listening to the Kami...",
    timerLabel: "Ki timer",
    repeatLow: (emojis) => `Reenter Low Phases — ${emojis}`,
    repeatFull: "Repeat Full Activation",
    done: "Done for Now",
    rateAll: "Sense all 4 phases to continue",
    coachBtn: "Receive Whisperings →",
    sysPrompt: "You are an Aiki-Dialogue coach in the tradition of R. Moon. The student just completed 'Ride the Lucky Wave' in RMoonE mode (4 phases: Center, Attune, Voice the Ki, Take Musu). Speak in the language of Aikido and Quantum Aikido — Ki, Unified-Field, unified field, feel where you are, whisperings of the Kami. Comment ONLY on phases scored 1–3 (Absent, Stirring, Blending). Skip 4–5 entirely. Under 140 words. No bullets, no headers. Warm, poetic, grounding. End with one sentence naming the single phase to return to.",
    defaultReview: "Even partial activation shifts the field. Your nervous system responds to intention as much as execution — keep riding."
  },
  standard: {
    title: "Ride the Lucky Wave",
    subtitle: "3-minute nervous system activation",
    intro: "Move, breathe, declare, launch — then self-report so the practice adapts to what you need most.",
    begin: "Begin Activation",
    beginHint: "Find a space to move, speak aloud, and breathe freely",
    scoreTitle: "How did you ride?",
    scoreSub: "Tap your compliance for each phase",
    resultTitle: "Your Wave Report",
    resultSub: "Average compliance",
    coaching: "Coaching",
    loading: "Reading your wave...",
    timerLabel: "Phase timer",
    repeatLow: (emojis) => `Repeat Low Phases — ${emojis}`,
    repeatFull: "Repeat Full Exercise",
    done: "Done for Now",
    rateAll: "Rate all 4 phases to continue",
    coachBtn: "Get Coaching Review →",
    sysPrompt: "You are a somatic activation coach for 'Ride the Lucky Wave' (4 phases: Activate, Access, Declare, Launch). Comment ONLY on phases scored 1–3. Skip 4–5 entirely. Under 140 words. No bullets, no headers. Warm, direct, energizing. End with one sentence naming the single phase to prioritize on a repeat.",
    defaultReview: "Even partial activation shifts the field. Your nervous system responds to intention as much as execution — keep riding."
  }
};
