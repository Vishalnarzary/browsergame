export type OfficeChatterLine = { text: string; kind: "office" | "motivation" };
export type OfficeChatterBatch = { sentences: OfficeChatterLine[] };

const TASKS = ["budget deck", "status report", "client notes", "timesheet", "sales forecast", "project tracker", "meeting recap", "expense form", "launch checklist", "risk log", "hiring plan", "spreadsheet", "quarterly review", "design brief", "roadmap", "team update", "invoice list", "training slides"];
const DEADLINES = ["before lunch", "before tomorrow", "before the stand-up", "by five", "before coffee cools", "before the next meeting", "by end of day", "before Friday", "before the printer notices", "before the boss circles back", "before inbox zero", "before the Wi-Fi gives up"];
const JOKES = ["the printer is already nervous", "the spreadsheet demands closure", "coffee has approved the plan", "the deadline sent a calendar invite", "the inbox is learning to multiply", "the meeting room wants overtime", "the pivot table believes in you", "the office plant is judging us", "the copier has entered witness protection", "the keyboard needs a tiny vacation", "the dashboard craves attention", "the stapler says this is urgent", "the Wi-Fi is holding a team meeting", "the calendar has trust issues", "the coffee machine wants a promotion", "the slide deck is practicing patience"];
const ACTIONS = ["showing up", "trying", "learning", "moving forward", "staying curious", "building momentum", "taking the next step", "trusting your work", "solving one thing at a time", "doing the brave thing", "making progress", "backing yourself"];
const STRENGTHS = ["steady effort", "persistence", "good judgment", "calm focus", "creative thinking", "patience", "courage", "consistency", "kindness", "determination", "confidence", "hard work"];
const RESULTS = ["turn chaos into progress", "make difficult work possible", "carry you through the deadline", "build something excellent", "create your next success", "outlast every awkward meeting", "make today count", "open the next door", "move the whole team forward", "beat the toughest spreadsheet", "make future you proud", "win the long game"];

export function normalizeOfficeChatter(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function buildFreshOfficeChatterFallback(history: string[], batchStart: number): OfficeChatterBatch | null {
  const seen = new Set(history.map(normalizeOfficeChatter));
  const seed = history.length * 17 + Math.floor(batchStart / 30) * 31;
  const sentences: OfficeChatterLine[] = [];
  const motivationTotal = ACTIONS.length * STRENGTHS.length * RESULTS.length;
  for (let offset = 0; offset < motivationTotal && sentences.length < 1; offset++) {
    const index = (seed + offset) % motivationTotal;
    const action = ACTIONS[index % ACTIONS.length];
    const strength = STRENGTHS[Math.floor(index / ACTIONS.length) % STRENGTHS.length];
    const result = RESULTS[Math.floor(index / (ACTIONS.length * STRENGTHS.length)) % RESULTS.length];
    const text = `Keep ${action}; your ${strength} will ${result}.`;
    if (!seen.has(normalizeOfficeChatter(text))) { seen.add(normalizeOfficeChatter(text)); sentences.push({ text, kind: "motivation" }); }
  }
  const officeTotal = TASKS.length * DEADLINES.length * JOKES.length;
  for (let offset = 0; offset < officeTotal && sentences.length < 7; offset++) {
    // A large coprime stride changes the task, deadline, and punchline together.
    const index = (seed * 7 + offset * 997) % officeTotal;
    const task = TASKS[index % TASKS.length];
    const deadline = DEADLINES[Math.floor(index / TASKS.length) % DEADLINES.length];
    const joke = JOKES[Math.floor(index / (TASKS.length * DEADLINES.length)) % JOKES.length];
    const text = `Finish the ${task} ${deadline}; ${joke}.`;
    if (!seen.has(normalizeOfficeChatter(text))) { seen.add(normalizeOfficeChatter(text)); sentences.push({ text, kind: "office" }); }
  }
  return sentences.length === 7 ? { sentences } : null;
}
