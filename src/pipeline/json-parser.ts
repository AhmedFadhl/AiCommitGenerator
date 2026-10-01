export function extractJson<T>(text: string): T {
  const input = text.trim();

  // 1. Direct JSON
  try {
    return JSON.parse(input) as T;
  } catch {
    // Continue
  }

  // 2. Markdown code block
  const codeBlock = input.match(
    /```(?:json)?\s*([\s\S]*?)\s*```/i
  );

  if (codeBlock?.[1]) {
    try {
      return JSON.parse(codeBlock[1].trim()) as T;
    } catch {
      // Continue
    }
  }

  // 3. Find JSON object
  const firstBrace = input.indexOf("{");
  const lastBrace = input.lastIndexOf("}");

  if (
    firstBrace !== -1 &&
    lastBrace !== -1 &&
    lastBrace > firstBrace
  ) {
    const candidate = input.slice(firstBrace, lastBrace + 1);

    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Continue
    }
  }

  throw new Error(
    `Could not extract valid JSON from response: ${input}`
  );
}
