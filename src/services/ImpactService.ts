export const GRAVITY_METERS_PER_SECOND_SQUARED = 9.80665;
export const IMPACT_THRESHOLD_G = 50;

export interface AccelerationSample {
  x: number;
  y: number;
  z: number;
  /** Use `g` for normalized gravity units or `m/s²` for SI acceleration. */
  unit: 'g' | 'm/s²';
  timestamp?: number;
}

export interface ImpactEvent {
  id: string;
  accelerationG: number;
  detectedAt: number;
}

export interface GyroscopeSample {
  x: number;
  y: number;
  z: number;
  unit: 'rad/s';
  timestamp: number;
}

export interface SensorMotionSample {
  acceleration: AccelerationSample;
  gyroscope: GyroscopeSample;
  timestamp: number;
}

export function accelerationMagnitudeG(sample: AccelerationSample): number {
  const magnitude = Math.sqrt(sample.x ** 2 + sample.y ** 2 + sample.z ** 2);
  return sample.unit === 'g' ? magnitude : magnitude / GRAVITY_METERS_PER_SECOND_SQUARED;
}

/** Detects a threshold crossing, resetting only after the reading falls below the threshold. */
export class ImpactService {
  private aboveThreshold = false;

  evaluate(sample: AccelerationSample): ImpactEvent | null {
    const magnitudeG = accelerationMagnitudeG(sample);
    if (!Number.isFinite(magnitudeG) || magnitudeG <= IMPACT_THRESHOLD_G) {
      this.aboveThreshold = false;
      return null;
    }
    if (this.aboveThreshold) return null;

    this.aboveThreshold = true;
    const detectedAt = sample.timestamp ?? Date.now();
    return {
      id: `impact-${detectedAt}-${Math.random().toString(36).slice(2, 8)}`,
      accelerationG: magnitudeG,
      detectedAt,
    };
  }

  /** Used by the dashboard simulator when it emits a peak-g test value. */
  evaluateMagnitudeG(magnitudeG: number): ImpactEvent | null {
    return this.evaluate({ x: 0, y: 0, z: magnitudeG, unit: 'g' });
  }
}
