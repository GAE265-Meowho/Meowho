const clauses = (text: string) => text.split(/[；;。\n]+/).map(part => part.trim()).filter(Boolean);

export function reportDashboardCopy(impact: string, action: string) {
  const statements = clauses(impact);
  // The report may end with an explicitly stated mitigation goal. Earlier
  // clauses can mix observations and qualifications and are kept verbatim.
  const goal = /^(?:可)?(?:降低|減少)(.{2,65})的(?:可能性?|機會|風險)$/.exec(statements.at(-1) ?? "");
  const subject = /^(貓咪?)(.+)$/.exec(goal?.[1] ?? "");
  const consequence = goal
    ? subject ? `${subject[1]}可能${subject[2]}。` : `可能後果：${goal[1]}。`
    : impact.length <= 70 && statements.length === 1 ? impact.trim() : "";
  return { consequence, actions: [...new Set(clauses(action))] };
}
