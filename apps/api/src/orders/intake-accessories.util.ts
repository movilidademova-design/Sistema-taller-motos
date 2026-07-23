/** Combines the labels of checked accessory checkboxes with the free-text "otro" field. */
export function buildAccessoriesText(labels: string[], otherText: string): string | undefined {
  const combined = [labels.join(', '), otherText.trim()].filter((part) => part !== '').join(', ');
  return combined === '' ? undefined : combined;
}
