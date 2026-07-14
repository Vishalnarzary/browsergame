export type OfficeChatterLine = { text: string; kind: "office" | "motivation" };
export type OfficeChatterBatch = { sentences: OfficeChatterLine[] };

const TASKS = ["budget deck", "status report", "client notes", "timesheet", "sales forecast", "project tracker", "meeting recap", "expense form", "launch checklist", "risk log", "hiring plan", "spreadsheet", "quarterly review", "design brief", "roadmap", "team update", "invoice list", "training slides"];
const DEADLINES = ["before lunch", "before tomorrow", "before the stand-up", "by five", "before coffee cools", "before the next meeting", "by end of day", "before Friday", "before the printer notices", "before the boss circles back", "before inbox zero", "before the Wi-Fi gives up"];
const JOKES = ["the printer is already nervous", "the spreadsheet demands closure", "coffee has approved the plan", "the deadline sent a calendar invite", "the inbox is learning to multiply", "the meeting room wants overtime", "the pivot table believes in you", "the office plant is judging us", "the copier has entered witness protection", "the keyboard needs a tiny vacation", "the dashboard craves attention", "the stapler says this is urgent", "the Wi-Fi is holding a team meeting", "the calendar has trust issues", "the coffee machine wants a promotion", "the slide deck is practicing patience"];
const ACTIONS = ["showing up", "trying", "learning", "moving forward", "staying curious", "building momentum", "taking the next step", "trusting your work", "solving one thing at a time", "doing the brave thing", "making progress", "backing yourself"];
const STRENGTHS = ["steady effort", "persistence", "good judgment", "calm focus", "creative thinking", "patience", "courage", "consistency", "kindness", "determination", "confidence", "hard work"];
const RESULTS = ["turn chaos into progress", "make difficult work possible", "carry you through the deadline", "build something excellent", "create your next success", "outlast every awkward meeting", "make today count", "open the next door", "move the whole team forward", "beat the toughest spreadsheet", "make future you proud", "win the long game"];

const OFFICE_TEMPLATES = [
  (task: string, deadline: string, joke: string) => `Quick update: the ${task} is due ${deadline}, and ${joke}.`,
  (task: string, _deadline: string, joke: string) => `Has anyone seen the ${task}? Apparently ${joke}.`,
  (task: string) => `Plot twist: the ${task} was the meeting all along.`,
  (task: string) => `The ${task} called; it wants fewer meetings and more snacks.`,
  (task: string) => `Today's plan: tame the ${task}, then negotiate with the coffee machine.`,
  (task: string) => `I opened the ${task}; now the dashboard needs emotional support.`,
  (task: string, deadline: string) => `Reminder: ${task} ${deadline}. Bribe the printer if necessary.`,
  (task: string, _deadline: string, joke: string) => `Breaking news: ${joke}, and the ${task} has witnesses.`,
  (task: string) => `The ${task} is almost ready; define "almost" after coffee.`,
  (task: string) => `Can we circle back to the ${task} after the Wi-Fi returns from lunch?`,
  (task: string) => `Good news: the ${task} exists. Bad news: it scheduled a meeting.`,
  (task: string) => `Please review the ${task}; it has developed strong opinions.`,
  (task: string, deadline: string) => `The ${task} wants approval ${deadline}. It also wants a tiny trophy.`,
  (task: string) => `I gave the ${task} one more column; it demanded a corner office.`,
  (task: string, _deadline: string, joke: string) => `Status: the ${task} is thriving, but ${joke}.`,
  (task: string) => `Who invited the ${task}? It brought twelve tabs and no snacks.`,
  (task: string) => `The ${task} is on track, assuming the track leads to coffee.`,
  (task: string, deadline: string) => `Tiny request: rescue the ${task} ${deadline}; the stapler is supervising.`,
] as const;

const MOTIVATION_TEMPLATES = [
  (_action: string, strength: string, result: string) => `Your ${strength} can ${result}; take the next step.`,
  (action: string, strength: string) => `Keep ${action}; even the printer respects ${strength}.`,
  (_action: string, strength: string) => `You have this - ${strength} beats any awkward deadline.`,
  (action: string, _strength: string, result: string) => `Small wins matter; ${action} is how you ${result}.`,
  (_action: string, strength: string) => `Trust your ${strength}; future you already sent a thank-you email.`,
  (action: string, _strength: string, result: string) => `Stay with it - ${action} will ${result}.`,
  (_action: string, strength: string) => `Progress counts; your ${strength} can outlast a grumpy spreadsheet.`,
  (_action: string, _strength: string, result: string) => `Your next brave step can ${result}.`,
] as const;

export function normalizeOfficeChatter(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function fitBubble(text: string) {
  if (text.length <= 90) return text;
  return `${text.slice(0, 87).replace(/\s+\S*$/, "").trimEnd()}...`;
}

export function buildFreshOfficeChatterFallback(history: string[], batchStart: number): OfficeChatterBatch | null {
  const seen = new Set(history.map(normalizeOfficeChatter));
  const seed = history.length * 17 + Math.floor(batchStart / 30) * 31;
  const sentences: OfficeChatterLine[] = [];
  const motivationTotal = ACTIONS.length * STRENGTHS.length * RESULTS.length * MOTIVATION_TEMPLATES.length;
  for (let offset = 0; offset < motivationTotal && sentences.length < 1; offset++) {
    const index = (seed + offset * 97) % (ACTIONS.length * STRENGTHS.length * RESULTS.length);
    const action = ACTIONS[index % ACTIONS.length];
    const strength = STRENGTHS[Math.floor(index / ACTIONS.length) % STRENGTHS.length];
    const result = RESULTS[Math.floor(index / (ACTIONS.length * STRENGTHS.length)) % RESULTS.length];
    const template = MOTIVATION_TEMPLATES[(seed + offset) % MOTIVATION_TEMPLATES.length];
    const text = fitBubble(template(action, strength, result));
    if (!seen.has(normalizeOfficeChatter(text))) { seen.add(normalizeOfficeChatter(text)); sentences.push({ text, kind: "motivation" }); }
  }
  const officeTotal = TASKS.length * DEADLINES.length * JOKES.length * OFFICE_TEMPLATES.length;
  for (let offset = 0; offset < officeTotal && sentences.length < 7; offset++) {
    const index = (seed * 7 + offset * 997) % (TASKS.length * DEADLINES.length * JOKES.length);
    const task = TASKS[index % TASKS.length];
    const deadline = DEADLINES[Math.floor(index / TASKS.length) % DEADLINES.length];
    const joke = JOKES[Math.floor(index / (TASKS.length * DEADLINES.length)) % JOKES.length];
    const template = OFFICE_TEMPLATES[(seed + offset) % OFFICE_TEMPLATES.length];
    const text = fitBubble(template(task, deadline, joke));
    if (!seen.has(normalizeOfficeChatter(text))) { seen.add(normalizeOfficeChatter(text)); sentences.push({ text, kind: "office" }); }
  }
  return sentences.length === 7 ? { sentences } : null;
}
