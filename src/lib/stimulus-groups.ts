/**
 * Grouping rule for shared stimuli (PLAN.md §3.2): in any list or test view,
 * questions that share a stimulus are kept contiguous and the stimulus renders
 * once above them. Order of first appearance is preserved; questions without a
 * stimulus form single-item groups.
 */
export type StimulusInfo = {
  id: string;
  kind: "text" | "image" | "video" | "audio";
  title: string | null;
  content: string | null;
  mediaUrl: string | null;
};

export type StimulusGroup<Q> = { key: string; stimulus: StimulusInfo | null; questions: Q[] };

export function groupByStimulus<Q extends { id: string; stimulus: StimulusInfo | null }>(
  questions: Q[]
): StimulusGroup<Q>[] {
  const groups: StimulusGroup<Q>[] = [];
  const byStimulus = new Map<string, StimulusGroup<Q>>();
  for (const q of questions) {
    if (!q.stimulus) {
      groups.push({ key: `q:${q.id}`, stimulus: null, questions: [q] });
      continue;
    }
    let g = byStimulus.get(q.stimulus.id);
    if (!g) {
      g = { key: `s:${q.stimulus.id}`, stimulus: q.stimulus, questions: [] };
      byStimulus.set(q.stimulus.id, g);
      groups.push(g);
    }
    g.questions.push(q);
  }
  return groups;
}

/** Flattened order after grouping: what a test serves so groups stay together. */
export function orderWithGroups<Q extends { id: string; stimulus: StimulusInfo | null }>(
  questions: Q[]
): Q[] {
  return groupByStimulus(questions).flatMap((g) => g.questions);
}
