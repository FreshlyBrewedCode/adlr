/**
 * Compute the pixel size for child `index` of a split layout.
 *
 * ratio absent / scalar: even division across all children.
 * ratio is an array: each entry is the fraction for the corresponding child.
 *   - The array is normalised so fractions always sum to 1.
 *   - If shorter than `count`, remaining children share leftover fraction equally.
 *
 * Rounding: every child is floored and the accumulated rounding remainder is
 * added to the last child so the total always equals `total`.
 */
export function computeChildSize(
  total: number,
  count: number,
  index: number,
  ratio: unknown,
): number {
  if (Array.isArray(ratio)) {
    const raw = ratio.slice(0, count).map((r) => (typeof r === "number" ? r : 0))
    const specified = raw.reduce((s, r) => s + r, 0)
    const remaining = Math.max(0, 1 - specified)
    const unspecified = count - raw.length
    const fallback = unspecified > 0 ? remaining / unspecified : 0
    const fractions: number[] = Array.from({ length: count }, (_, i) =>
      i < raw.length ? raw[i] : fallback,
    )
    const sum = fractions.reduce((s, f) => s + f, 0)
    const normalised = sum > 0 ? fractions.map((f) => f / sum) : fractions.map(() => 1 / count)

    const sizes = normalised.map((f) => Math.floor(total * f))
    const used = sizes.reduce((s, v) => s + v, 0)
    sizes[count - 1] += total - used
    return sizes[index]
  }

  // Even division fallback.
  const base = Math.floor(total / count)
  const remainder = total - base * count
  return index < count - 1 ? base : base + remainder
}
