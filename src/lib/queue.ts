/**
 * In-process job queue with retries. It has the same shape as a hosted queue
 * (send / process / stats), so it can be swapped for SQS or BullMQ when food
 * updates need to survive restarts or be shared across instances.
 */
export class JobQueue<T> {
  private pending: Array<{ job: T; attempts: number }> = [];
  private running = false;
  private stats = { enqueued: 0, processed: 0, failed: 0, lastProcessedAt: undefined as string | undefined };

  constructor(private name: string, private worker: (job: T) => Promise<void>, private maxAttempts = 3) {}

  send(job: T) {
    this.pending.push({ job, attempts: 0 });
    this.stats.enqueued++;
    void this.drain();
  }

  status() {
    return { name: this.name, depth: this.pending.length, running: this.running, ...this.stats };
  }

  private async drain() {
    if (this.running) return;
    this.running = true;
    while (this.pending.length) {
      const next = this.pending.shift()!;
      try {
        await this.worker(next.job);
        this.stats.processed++;
        this.stats.lastProcessedAt = new Date().toISOString();
      } catch (e) {
        next.attempts++;
        if (next.attempts < this.maxAttempts) this.pending.push(next);
        else {
          this.stats.failed++;
          console.error(`[queue:${this.name}] job failed permanently`, e);
        }
      }
    }
    this.running = false;
  }
}
