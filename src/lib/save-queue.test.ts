import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSaveQueue, type SaveOutcome, type SaveQueueState } from "./save-queue";

/** A fake server: each call waits for the test to settle it. */
function fakeServer() {
  const calls: Array<{ key: string; value: string; settle: (o: SaveOutcome | Error) => void }> = [];
  const save = (key: string, value: string) =>
    new Promise<SaveOutcome>((resolve, reject) => {
      calls.push({
        key,
        value,
        settle: (o) => (o instanceof Error ? reject(o) : resolve(o)),
      });
    });
  return { calls, save };
}
const tick = () => vi.advanceTimersByTimeAsync(0);

describe("save queue (H1.1)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("a saved answer leaves the queue", async () => {
    const server = fakeServer();
    const states: SaveQueueState[] = [];
    const q = createSaveQueue<string>({ save: server.save, onChange: (s) => states.push(s) });
    q.set("q1", "a");
    expect(q.state()).toEqual({ pending: 1, failing: false });
    server.calls[0].settle("saved");
    await tick();
    expect(q.state()).toEqual({ pending: 0, failing: false });
    expect(states.at(-1)).toEqual({ pending: 0, failing: false });
  });

  it("a failed request is retried until it lands (the wifi drop)", async () => {
    const server = fakeServer();
    const q = createSaveQueue<string>({ save: server.save, delays: [1000, 2000] });
    q.set("q1", "a");
    server.calls[0].settle(new Error("Failed to fetch"));
    await tick();
    expect(q.state()).toEqual({ pending: 1, failing: true });
    await vi.advanceTimersByTimeAsync(999);
    expect(server.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(server.calls).toHaveLength(2);
    server.calls[1].settle("retry");
    await tick();
    await vi.advanceTimersByTimeAsync(2000);
    expect(server.calls).toHaveLength(3);
    expect(server.calls[2].value).toBe("a");
    server.calls[2].settle("saved");
    await tick();
    expect(q.state()).toEqual({ pending: 0, failing: false });
  });

  it("the newest answer wins: a change made while a save is on its way is sent after it", async () => {
    const server = fakeServer();
    const q = createSaveQueue<string>({ save: server.save });
    q.set("q1", "a");
    q.set("q1", "b");
    expect(server.calls).toHaveLength(1); // one request at a time per question
    server.calls[0].settle("saved");
    await tick();
    expect(q.state().pending).toBe(1);
    expect(server.calls).toHaveLength(2);
    expect(server.calls[1].value).toBe("b");
    server.calls[1].settle("saved");
    await tick();
    expect(q.state().pending).toBe(0);
  });

  it("a retry sends the newest answer, not the one that failed", async () => {
    const server = fakeServer();
    const q = createSaveQueue<string>({ save: server.save, delays: [1000] });
    q.set("q1", "a");
    server.calls[0].settle("retry");
    await tick();
    q.set("q1", "b"); // sends at once, without waiting out the backoff
    expect(server.calls).toHaveLength(2);
    expect(server.calls[1].value).toBe("b");
    server.calls[1].settle("saved");
    await tick();
    await vi.advanceTimersByTimeAsync(5000);
    expect(server.calls).toHaveLength(2);
    expect(q.state().pending).toBe(0);
  });

  it("an answer the server refuses for good is dropped, not retried forever", async () => {
    const server = fakeServer();
    const q = createSaveQueue<string>({ save: server.save });
    q.set("q1", "a");
    server.calls[0].settle("fatal");
    await tick();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(server.calls).toHaveLength(1);
    expect(q.state()).toEqual({ pending: 0, failing: false });
  });

  it("one question failing doesn't block another", async () => {
    const server = fakeServer();
    const q = createSaveQueue<string>({ save: server.save });
    q.set("q1", "a");
    q.set("q2", "b");
    server.calls[0].settle("retry");
    server.calls[1].settle("saved");
    await tick();
    expect(q.state().pending).toBe(1);
  });

  it("flush resends at once and resolves true when everything is saved", async () => {
    const server = fakeServer();
    const q = createSaveQueue<string>({ save: server.save, delays: [15_000] });
    q.set("q1", "a");
    server.calls[0].settle("retry");
    await tick();
    const done = q.flush(8000);
    expect(server.calls).toHaveLength(2); // didn't wait 15 s
    server.calls[1].settle("saved");
    await expect(done).resolves.toBe(true);
  });

  it("flush resolves false when the answers still can't be saved in time", async () => {
    const server = fakeServer();
    const q = createSaveQueue<string>({ save: server.save });
    q.set("q1", "a");
    const done = q.flush(3000);
    await vi.advanceTimersByTimeAsync(3000);
    await expect(done).resolves.toBe(false);
    expect(q.state().pending).toBe(1);
  });

  it("flush on an empty queue is true straight away", async () => {
    const q = createSaveQueue<string>({ save: fakeServer().save });
    await expect(q.flush(1000)).resolves.toBe(true);
  });

  it("retryNow (back online) resends without waiting out the backoff", async () => {
    const server = fakeServer();
    const q = createSaveQueue<string>({ save: server.save, delays: [15_000] });
    q.set("q1", "a");
    server.calls[0].settle("retry");
    await tick();
    q.retryNow();
    expect(server.calls).toHaveLength(2);
    server.calls[1].settle("saved");
    await tick();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(server.calls).toHaveLength(2); // the old backoff timer was cancelled
  });
});
