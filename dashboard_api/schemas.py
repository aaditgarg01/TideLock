from typing import Literal, Annotated
from pydantic import BaseModel, ConfigDict, Field, StrictInt, model_validator

ControllerName = Literal['fixed', 'threshold', 'predictive']
ScenarioName = Literal['ordinary','monsoon','high_tide','compound','blockage','near_full',
    'sensor_bias','sensor_stuck','communication_loss','telemetry_delay','actuator_delay',
    'actuator_stuck','capacity_error','model_mismatch','maintenance','extreme_tide','flap_failed']
Scalar = str | int | float | bool | None


class RunRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    scenario: ScenarioName = 'compound'
    controllers: list[ControllerName] = Field(default=['predictive'], min_length=1, max_length=3)
    seeds: list[Annotated[StrictInt, Field(ge=0, le=4294967295)]] = Field(default=[11], min_length=1,max_length=10)
    duration_s: Literal[300,600,900,1200,1800] = 1800
    dt_s: Literal[2.5,5.0] = 5.0
    threshold_open_m: float = Field(default=1.30,ge=1.1,le=1.5,allow_inf_nan=False)
    threshold_close_m: float = Field(default=1.10,ge=.8,le=1.4,allow_inf_nan=False)
    predictive_cap_m: float = Field(default=1.60,ge=1.4,le=1.6,allow_inf_nan=False)

    @model_validator(mode='after')
    def validate_comparison(self):
        if len(set(self.seeds)) != len(self.seeds) or len(set(self.controllers)) != len(self.controllers):
            raise ValueError('Seeds and controllers must be unique')
        if self.threshold_close_m >= self.threshold_open_m:
            raise ValueError('Closing threshold must be below opening threshold')
        return self


class CaseIndex(BaseModel):
    case_id: str
    controller: ControllerName
    seed: int
    status: Literal['complete','failed']
    error: str | None = None


class RunStatus(BaseModel):
    id: str
    status: Literal['queued','running','complete','partial','failed']
    created_at: str
    updated_at: str
    request: RunRequest
    completed_cases: int = 0
    total_cases: int
    cases: list[CaseIndex] = []
    error: str | None = None
    warnings: list[str] = []


class Metrics(BaseModel):
    model_config = ConfigDict(extra='allow')
    scenario: str
    seed: int
    controller: ControllerName
    disturbance_sha256: str
    dt_s: float
    incoming_kg: float
    captured_kg: float
    escaped_kg: float
    suspended_final_kg: float
    basket_final_kg: float
    capture_fraction: float
    escape_fraction: float
    max_level_m: float
    warning_duration_s: float
    warning_excess_ms: float
    safety_violation_episodes: int
    safety_violation_duration_s: float
    basket_overflow_events: int
    compute_median_ms: float
    compute_p95_ms: float
    water_residual_relative: float
    plastic_residual_relative: float
    recovery_after_fault_s: float | None


class Trace(BaseModel):
    time_s: float
    h_m: float
    tide_m: float
    qin_m3s: float
    qout_m3s: float
    basket_kg: float
    suspended_kg: float
    captured_kg: float
    escaped_kg: float
    incoming_kg: float
    removed_kg: float
    actuator: float
    target: float
    mode: str
    spill_m3: float
    rejected_kg: float
    water_error_m3: float
    plastic_error_kg: float
    travel: float


class Event(BaseModel):
    time_s: float
    severity: Literal['info','warning','critical']
    category: Literal['injected','detected','command','condition','maintenance','controller']
    event: str
    detail: str
    measurements: dict[str, Scalar] = {}


class Update(BaseModel):
    time_s: float
    mode: str
    seconds: float
    feasible_plans: int
    reliable: bool
    reason: str
    target: float


class CaseResult(BaseModel):
    case_id: str
    parameters: dict[str, float | bool] = {}
    metrics: Metrics
    traces: list[Trace]
    events: list[Event]
    updates: list[Update]


class Comparison(BaseModel):
    kind: Literal['single-seed','multi-seed']
    expected_cases: int
    successful_cases: int
    paired_inputs_verified: bool
    complete_pairs: bool
    case_metrics: list[Metrics]
    aggregates: list[dict[str, Scalar]]
    failed_cases: list[CaseIndex]
    note: str


class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorDetail
