"""Pre-generated disturbances shared across controllers, including noise."""
from dataclasses import dataclass, replace
import hashlib
import numpy as np
from .model import Parameters

SCENARIOS = ('ordinary', 'monsoon', 'high_tide', 'compound', 'blockage',
             'near_full', 'sensor_bias', 'sensor_stuck', 'communication_loss',
             'telemetry_delay', 'actuator_delay', 'actuator_stuck',
             'capacity_error', 'model_mismatch', 'maintenance',
             'extreme_tide', 'flap_failed')


def pulse(t, start=360, peak=660, end=1020):
    return np.maximum(0, np.minimum((t-start)/(peak-start), (end-t)/(end-peak)))


@dataclass
class Scenario:
    name: str
    seed: int
    times: np.ndarray
    qin: np.ndarray
    tide: np.ndarray
    plastic: np.ndarray
    noise: np.ndarray
    forecast_q: np.ndarray
    forecast_tide: np.ndarray
    forecast_plastic: np.ndarray
    p: Parameters
    initial_basket: float = 0.0
    blockage: float = 0.0
    hydraulic_factor: float = 1.0
    capture_factor: float = 1.0
    fault_start: float = 600.0
    fault_end: float = 900.0
    duration: float = 1800.0

    def index(self, t):
        return min(int(t // 5), len(self.times)-1)

    def active_fault(self, t):
        return self.fault_start <= t < self.fault_end

    def digest(self):
        data = np.column_stack([self.qin,self.tide,self.plastic,self.noise,
                               self.forecast_q,self.forecast_tide,self.forecast_plastic])
        return hashlib.sha256(data.tobytes()).hexdigest()


def make_scenario(name, seed=11, deterministic=False):
    if name not in SCENARIOS:
        raise ValueError(f'Unknown scenario {name}')
    t = np.arange(0, 2105, 5.0)
    rng = np.random.default_rng(seed)
    surge = name not in ('ordinary', 'high_tide')
    elevated = name not in ('ordinary', 'monsoon')
    base_q = 0.12 + (0.75 * pulse(t) if surge else 0.04 * pulse(t))
    base_d = 0.35 + (1.0 * pulse(t, 180, 720, 1440) if elevated else 0.08 * np.sin(t/1000))
    if name in ('extreme_tide', 'flap_failed'):
        base_d = np.full_like(t, 2.0)
    plastic = 0.012 + 0.04 * pulse(t, 330, 630, 960)
    scale = 0.0 if deterministic else 1.0
    q = np.maximum(0, base_q * (1 + scale * rng.normal(0, 0.03, len(t))))
    d = base_d + scale * rng.normal(0, 0.005, len(t))
    plastic = plastic * (1 + scale * rng.normal(0, 0.04, len(t)))
    noise = scale * rng.normal(0, 0.008, (len(t), 2))
    # Imperfect advance schedule, intentionally not a real weather forecast.
    fq = 0.12 + (0.75 if surge else 0.04) * 0.90 * pulse(t, 390, 690, 1050)
    fd = base_d + 0.03 * np.sin(t/330)
    fp = 0.012 + 0.036 * pulse(t, 360, 660, 990)
    p = Parameters(nonreturn_flap=name != 'flap_failed')
    return Scenario(name, seed, t, q, d, plastic, noise, fq, fd, fp, p,
                    initial_basket=36 if name == 'near_full' else 0,
                    blockage=0.4 if name == 'blockage' else 0,
                    hydraulic_factor=0.8 if name == 'model_mismatch' else 1,
                    capture_factor=0.7 if name == 'model_mismatch' else 1)
