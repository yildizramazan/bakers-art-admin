export interface CommandAttempt {
  readonly fingerprint: string;
  readonly identifiers: Readonly<Record<string, string>>;
}

/** An uncertain response keeps its identity. Editing the command starts a new intent. */
export function prepareCommandAttempt(
  form: FormData,
  previous: CommandAttempt | undefined,
  generatedFields: readonly string[],
  newID: () => string,
): CommandAttempt {
  const entries = [...form.entries()]
    .filter(([name]) => !generatedFields.includes(name) && !name.startsWith("$ACTION_"))
    .map(([name, value]) => {
      if (typeof value !== "string") throw new Error("This command does not accept files.");
      return [name, value.trim()] as const;
    })
    .sort(([left, a], [right, b]) => left < right ? -1 : left > right ? 1 : a < b ? -1 : a > b ? 1 : 0);
  const fingerprint = JSON.stringify([generatedFields, entries]);
  const attempt = previous?.fingerprint === fingerprint ? previous : {
    fingerprint,
    identifiers: Object.fromEntries(generatedFields.map((name) => [name, newID()])),
  };
  for (const name of generatedFields) {
    const id = attempt.identifiers[name];
    if (!id) throw new Error("Command identity is unavailable.");
    form.set(name, id);
  }
  return attempt;
}
