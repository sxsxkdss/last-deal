/** Logical time in milliseconds. Equal deadlines execute in insertion order. */
export class Clock {
  now = 0;
  private sequence = 0;
  private jobs = new Map<number, { at: number; run: () => void }>();
  after(run: () => void, delay: number) {
    const id = ++this.sequence;
    this.jobs.set(id, { at: this.now + delay, run });
    return id;
  }
  cancel(id: number) {
    this.jobs.delete(id);
  }
  get next() {
    return Math.min(...Array.from(this.jobs.values(), (job) => job.at));
  }
  advance(ms: number) {
    if (!Number.isFinite(ms) || ms < 0) throw new RangeError('Invalid elapsed time');
    const end = this.now + ms;
    while (this.next <= end) {
      const at = this.next;
      const [id, job] = Array.from(this.jobs).find(([, job]) => job.at === at)!;
      this.jobs.delete(id);
      this.now = at;
      job.run();
    }
    this.now = end;
  }
}
export function seeded(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
