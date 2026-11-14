const validateLimit = (limit: number) => {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError('Concurrency limit must be a positive integer.');
};

/** Limits jobs across callers, releasing each slot even when a job fails. */
export const createConcurrencyLimiter = (limit: number) => {
  validateLimit(limit);
  let active = 0;
  const queue: (() => void)[] = [];
  const drain = () => {
    while (active < limit && queue.length) queue.shift()!();
  };

  return <T>(job: () => Promise<T>): Promise<T> => new Promise((resolve, reject) => {
    queue.push(() => {
      active++;
      const release = () => {
        active--;
        drain();
      };
      Promise.resolve().then(job).then(
        value => { resolve(value); release(); },
        error => { reject(error); release(); },
      );
    });
    drain();
  });
};

/** Processes a batch with bounded concurrency, preserving its original order. */
export const mapLimit = async <T, R>(
  items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> => {
  validateLimit(limit);
  const results: R[] = new Array(items.length);
  let next = 0;
  let failed = false;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (!failed && next < items.length) {
      const index = next++;
      try {
        results[index] = await fn(items[index], index);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  }));
  return results;
};
