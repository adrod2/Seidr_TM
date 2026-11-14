import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { test } from 'node:test';
import { createConcurrencyLimiter, mapLimit } from './asyncUtils.ts';

test('batch processing keeps result order while starting only the allowed number of jobs', async () => {
  const gates = Array.from({ length: 4 }, () => Promise.withResolvers());
  const started = [];
  const result = mapLimit([0, 1, 2, 3], 2, async index => {
    started.push(index);
    await gates[index].promise;
    return `result ${index}`;
  });
  assert.deepEqual(started, [0, 1]);
  gates[1].resolve();
  await setImmediate();
  assert.deepEqual(started, [0, 1, 2]);
  gates[2].resolve();
  await setImmediate();
  assert.deepEqual(started, [0, 1, 2, 3]);
  gates[3].resolve();
  gates[0].resolve();
  assert.deepEqual(await result, ['result 0', 'result 1', 'result 2', 'result 3']);
  assert.deepEqual(await mapLimit([], 2, async () => assert.fail('Unexpected job')), []);
});

test('a failed batch surfaces its error and stops assigning new jobs', async () => {
  const gates = [Promise.withResolvers(), Promise.withResolvers()];
  const started = [];
  const result = mapLimit([0, 1, 2, 3], 2, async index => {
    started.push(index);
    await gates[index].promise;
  });
  const rejected = assert.rejects(result, /processing failed/);
  gates[0].reject(new Error('processing failed'));
  await rejected;
  gates[1].resolve();
  await setImmediate();
  assert.deepEqual(started, [0, 1]);
});

test('a shared limiter caps digest requests across parallel document batches', async () => {
  const limit = createConcurrencyLimiter(3);
  let active = 0;
  let peak = 0;
  const results = await mapLimit([0, 1, 2], 3, document =>
    mapLimit([0, 1, 2, 3], 3, part => limit(async () => {
      active++;
      peak = Math.max(peak, active);
      await setImmediate();
      active--;
      return `${document}:${part}`;
    })),
  );
  assert.equal(peak, 3);
  assert.equal(active, 0);
  assert.deepEqual(results, [
    ['0:0', '0:1', '0:2', '0:3'],
    ['1:0', '1:1', '1:2', '1:3'],
    ['2:0', '2:1', '2:2', '2:3'],
  ]);
});

test('limiter releases slots after synchronous and asynchronous failures', async () => {
  const limit = createConcurrencyLimiter(1);
  const jobs = [
    limit(() => { throw new Error('sync failure'); }),
    limit(async () => { throw new Error('async failure'); }),
    limit(async () => 'recovered'),
  ];
  assert.deepEqual((await Promise.allSettled(jobs)).map(result =>
    result.status === 'fulfilled' ? result.value : result.reason.message),
  ['sync failure', 'async failure', 'recovered']);
});

test('invalid concurrency settings fail explicitly instead of dropping or hanging jobs', async () => {
  for (const limit of [0, -1, 1.5, NaN, Infinity]) {
    assert.throws(() => createConcurrencyLimiter(limit), RangeError);
    await assert.rejects(mapLimit([1], limit, async item => item), RangeError);
  }
});
