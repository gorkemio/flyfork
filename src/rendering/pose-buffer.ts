import type { Pose } from '../simulation/state';
export class PoseBuffer {
    private previous: Pose | null = null;
    private current: Pose | null = null;
    private key = '';
    private received = 0;
    push(pose: Pose, key: string, now: number): void {
        if (key !== this.key || !this.current || pose.tick <= this.current.tick)
            this.previous = { ...pose };
        else
            this.previous = this.current;
        this.current = { ...pose };
        this.key = key;
        this.received = now;
    }
    sample(now: number): Pose | null {
        if (!this.current || !this.previous)
            return null;
        const t = Math.max(0, Math.min(1, (now - this.received) / 50));
        const a = this.previous, b = this.current;
        return { tick: b.tick, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, heading: a.heading + (b.heading - a.heading) * t };
    }
}
