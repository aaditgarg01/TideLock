"""Conservative lumped storage and well-mixed plastic transport.

Vectorized over candidate trajectories for the predictive controller. All
parameters except gravitational acceleration are illustrative assumptions.
"""
from dataclasses import dataclass, asdict
import numpy as np


@dataclass(frozen=True)
class Parameters:
    storage_area: float = 120.0       # m2, synthetic effective storage area
    screen_area: float = 0.16        # m2, equivalent hydraulic area
    bypass_area: float = 0.32        # m2
    discharge_coefficient: float = 0.65  # nominal orifice convention, uncalibrated
    gravity: float = 9.81            # m/s2
    basket_capacity: float = 40.0    # kg
    fill_resistance: float = 0.85    # dimensionless synthetic blockage law
    capture_efficiency: float = 0.85 # synthetic, not measured
    capture_flow_scale: float = 1.0  # m3/s, synthetic rolloff
    actuator_rate: float = 1 / 60    # fraction of stroke per second
    warning_level: float = 1.30      # m above local invert, synthetic
    safety_level: float = 1.60       # m above local invert, synthetic
    rim_level: float = 2.80         # m, physical storage spill threshold
    nonreturn_flap: bool = True

    def __post_init__(self):
        if min(self.storage_area, self.screen_area, self.bypass_area,
               self.basket_capacity, self.capture_flow_scale) <= 0:
            raise ValueError('Areas, basket capacity and flow scale must be positive')
        if not 0 < self.warning_level < self.safety_level < self.rim_level:
            raise ValueError('Require warning < safety < rim')
        if not 0 <= self.capture_efficiency <= 1 or not 0 <= self.fill_resistance < 1:
            raise ValueError('Invalid capture or resistance fraction')

    def dictionary(self):
        return asdict(self)


def step(h, basket, suspended, actuator, target, qin, tide, plastic_rate,
         p, dt=5.0, blockage=0.0, hydraulic_factor=1.0,
         capture_factor=1.0, rate_factor=1.0):
    """Advance state; return new state and extensive fluxes for exact ledgers.

    Positive q is outward; negative q is clean tidal backflow. Plastic is
    well-mixed floatable inventory (an approximation, not particle tracking).
    Plastic remaining in storage is counted, not relabelled as capture.
    """
    a = actuator + np.clip(target - actuator, -p.actuator_rate * rate_factor * dt,
                          p.actuator_rate * rate_factor * dt)
    a = np.clip(a, 0, 1)
    screen = p.screen_area * np.maximum(0.02, (1 - blockage) *
                                        (1 - p.fill_resistance * basket / p.basket_capacity))
    area = screen + p.bypass_area * a
    head = h - tide
    q = p.discharge_coefficient * hydraulic_factor * area * np.sign(head) * np.sqrt(2 * p.gravity * np.abs(head))
    if p.nonreturn_flap:
        q = np.maximum(q, 0)
    volume = h * p.storage_area
    q = np.minimum(q, (volume + qin * dt) / dt)
    wet_volume = volume + qin * dt + np.maximum(-q, 0) * dt
    remaining_volume = wet_volume - np.maximum(q, 0) * dt
    spill = np.maximum(remaining_volume - p.rim_level * p.storage_area, 0)
    next_h = (remaining_volume - spill) / p.storage_area

    incoming = plastic_rate * dt
    pool = suspended + incoming
    outward = np.maximum(q, 0) * dt
    fraction = np.minimum(1, (outward + spill) / np.maximum(wet_volume, 1e-12))
    transported = pool * fraction
    routed_to_outlet = transported * outward / np.maximum(outward + spill, 1e-12)
    efficiency = np.clip(p.capture_efficiency * capture_factor /
                         (1 + (np.maximum(q, 0) / p.capture_flow_scale)**2), 0, 1)
    potential_capture = routed_to_outlet * screen / area * efficiency
    captured = np.minimum(potential_capture, np.maximum(p.basket_capacity - basket, 0))
    escaped = transported - captured
    return dict(h=next_h, basket=basket + captured, suspended=pool - transported,
                actuator=a, captured=captured, escaped=escaped, incoming=incoming,
                q=q, spill=spill, rejected=np.maximum(potential_capture - captured, 0))
