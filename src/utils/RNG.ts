/**
 * Lightweight deterministic pseudo random number generator based on a Lehmer LCG.
 */
export default class RNG {
  private static readonly MODULUS = 2147483647;
  private static readonly MULTIPLIER = 48271;

  private state: number;

  /**
   * @param seed Base seed value that determines the output sequence.
   */
  public constructor(seed: number) {
    this.state = RNG.normalizeSeed(seed);
  }

  /**
   * Produces the next floating point number in the range [0, 1).
   */
  public next(): number {
    this.state = (this.state * RNG.MULTIPLIER) % RNG.MODULUS;
    return (this.state - 1) / (RNG.MODULUS - 1);
  }

  /**
   * Coerces arbitrary seed input into the valid domain for the generator.
   */
  private static normalizeSeed(seed: number): number {
    const modulus = RNG.MODULUS;
    let normalized = Math.floor(seed) % modulus;

    if (normalized <= 0) {
      normalized += modulus - 1;
    }

    return normalized;
  }
}
