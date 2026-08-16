export class Input {
  private keys = new Set<string>();
  private keysPressed = new Set<string>();
  mouseX = 0;
  mouseY = 0;
  mouseDown = false;
  mouseMiddleDown = false;
  mouseRightDown = false;
  mousePressed = false;
  mouseMiddlePressed = false;
  mouseRightPressed = false;
  wheelDelta = 0;

  constructor(target: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.keysPressed.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    target.addEventListener('mousemove', (e) => {
      const rect = target.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;
    });
    target.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouseDown = true;
        this.mousePressed = true;
      }
      if (e.button === 1) {
        this.mouseMiddleDown = true;
        this.mouseMiddlePressed = true;
        e.preventDefault(); // stop browser autoscroll cursor
      }
      if (e.button === 2) {
        this.mouseRightDown = true;
        this.mouseRightPressed = true;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 1) this.mouseMiddleDown = false;
      if (e.button === 2) this.mouseRightDown = false;
    });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    target.addEventListener('auxclick', (e) => e.preventDefault());
    target.addEventListener(
      'wheel',
      (e) => {
        this.wheelDelta += e.deltaY;
        e.preventDefault();
      },
      { passive: false },
    );
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  wasPressed(code: string): boolean {
    return this.keysPressed.has(code);
  }

  /** Call once per frame after all systems have read pressed-state. */
  endFrame(): void {
    this.keysPressed.clear();
    this.mousePressed = false;
    this.mouseMiddlePressed = false;
    this.mouseRightPressed = false;
    this.wheelDelta = 0;
  }
}
