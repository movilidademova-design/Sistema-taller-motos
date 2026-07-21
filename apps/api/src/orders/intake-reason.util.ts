/** Combines the labels of the selected quick-service tags with the client's free-text description. */
export function buildIntakeReason(quickServiceLabels: string[], description: string): string {
  return [quickServiceLabels.join(', '), description.trim()].filter((part) => part !== '').join(' — ');
}
