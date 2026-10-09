"""Three strategies with explicit information boundaries and fault fallback."""
from dataclasses import dataclass, replace
from itertools import product
import numpy as np
from .model import step


@dataclass
class Observation:
    h: float
    tide: float
    basket: float
    suspended: float
    actuator: float
    reliable: bool
    reason: str
    uncertainty: float = 0.025


def fallback(o):
    # Closing bypass reduces (does not eliminate) possible backflow. No
    # generic 'open is safe' claim; uncertainty can make drainage unattainable.
    positive_head = o.h - o.uncertainty > o.tide + o.uncertainty
    return (1.0 if positive_head else 0.0), 'ALERT: fallback request; safety not guaranteed'


class Fixed:
    name = 'fixed'
    def decide(self, o, forecast, p):
        return 0.0, 'fixed', 0


class Threshold:
    name = 'threshold'
    def __init__(self, opening=1.30, closing=1.10):
        self.opening, self.closing, self.target = opening, closing, 0.0

    def decide(self, o, forecast, p):
        if not o.reliable:
            u, msg = fallback(o)
            self.target = u
            return u, msg, 0
        if o.h <= o.tide:
            self.target = 0.0
        elif o.h >= self.opening:
            self.target = 1.0
        elif o.h <= self.closing:
            self.target = 0.0
        return self.target, 'threshold', 0


class Predictive:
    name = 'predictive'
    def __init__(self, cap=1.60):
        self.cap = cap
        self.plans = np.asarray(list(product([0., 0.5, 1.], repeat=3)))

    def decide(self, o, forecast, p):
        if not o.reliable:
            u, msg = fallback(o)
            return u, msg, 0
        # Nominal plus sampled inflow/tide uncertainty corners. This finite
        # stress set is not a robust-invariance proof over continuous bounds.
        qf = np.array([1, .8, .8, 1.2, 1.2])[None,:]
        ds = np.array([0, -.08, .08, -.08, .08])[None,:]
        shape = (len(self.plans), 5)
        h = np.full(shape, o.h) + np.array([0,.025,.025,.025,.025])
        b = np.full(shape, o.basket) + np.array([0,2,2,2,2])
        b = np.minimum(b, p.basket_capacity)
        m = np.full(shape, o.suspended)
        a = np.full(shape, o.actuator)
        score = np.zeros(shape)
        feasible = np.ones(shape, dtype=bool)
        max_h = h.copy()
        for j in range(36):
            u = self.plans[:,j//12,None]
            old_a = a
            f = forecast[j]
            z = step(h,b,m,a,u,f[0]*qf,f[1]+ds,f[2],p,5,
                     blockage=f[3], hydraulic_factor=np.array([1,.85,.85,.85,.85])[None,:])
            h,b,m,a = (z[k] for k in ('h','basket','suspended','actuator'))
            max_h = np.maximum(max_h,h)
            feasible &= h <= self.cap + 1e-12
            score += (-z['captured'] + .25*z['escaped'] +
                      .01*np.abs(a-old_a) + .005*np.maximum(h-p.warning_level,0)**2*5)
        valid = feasible.all(axis=1)
        if not valid.any():
            u,msg = fallback(o)
            return u, msg + '; no feasible sampled plan', 0
        # Reward applies only after safety filtering. Terminal water inventory
        # is not assigned a safety guarantee; the missing invariant terminal
        # set is a declared limitation.
        objective = score.mean(axis=1) + .02*np.abs(np.diff(self.plans,axis=1)).sum(axis=1)
        objective[~valid] = np.inf
        k = int(np.argmin(objective))
        return float(self.plans[k,0]), 'predictive', int(valid.sum())
