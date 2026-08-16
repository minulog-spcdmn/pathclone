export type UpdateFn = (dt: number) => void;
export type RenderFn = () => void;

/** Fixed-timestep update with variable-rate render, standard accumulator pattern. */
export class GameLoop {
  private accumulator = 0;
  private lastTime = 0;
  private running = false;
  readonly step = 1 / 60;
  private rafId = 0;
  private update: UpdateFn;
  private render: RenderFn;

  constructor(update: UpdateFn, render: RenderFn) {
    this.update = update;
    this.render = render;
  }

  start(): void {
    this.running = true;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    let frameTime = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (frameTime > 0.25) frameTime = 0.25; // clamp to avoid spiral of death on tab-out
    this.accumulator += frameTime;
    while (this.accumulator >= this.step) {
      this.update(this.step);
      this.accumulator -= this.step;
    }
    this.render();
    this.rafId = requestAnimationFrame(this.tick);
  };
}
