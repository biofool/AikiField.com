"""CloudManagement intent/actual reporting client.

A lightweight, stdlib-only client that sub-projects use to declare
expected API usage before making calls and report actuals after (or
incrementally during long jobs).  CloudManagement validates actual vs
intent, detects overruns, and can kill the specific job that is
accumulating cost.

Typical usage:

    from cloud_management_client import CloudManagementClient

    cb = CloudManagementClient(
        project_id="aisuppportvigilent",
        report_token=os.environ["CLOUDMANAGEMENT_REPORT_TOKEN_AISUPPPORTVIGILENT"],
        # base_url defaults to http://127.0.0.1:8080 for local dev;
        # set to the Cloud Run URL in production.
    )

    # Declare intent before a batch of API calls (synchronous — needs
    # the response to check approval)
    intent = cb.declare_intent(
        job_id="gemini-session-abc123",
        job_name="coaching-chat-batch",
        provider="google",
        api="gemini-3.1-flash-lite",
        expected_calls=500,
        expected_cost_usd=2.50,
        rate_limit_rpm=10,
        source_repo="AISuppportVigilent",
    )
    if not intent.approved:
        raise RuntimeError(f"intent denied: {intent.reason}")

    # ... make API calls ...

    # Report actual (incremental — fire-and-forget via background thread
    # so it never blocks the caller)
    cb.report_actual(
        intent_id=intent.intent_id,
        job_id="gemini-session-abc123",
        provider="google",
        api="gemini-3.1-flash-lite",
        actual_calls=150,
        actual_cost_usd=0.75,
        status="running",   # "running" | "completed" | "failed"
    )

    # Final report when done (synchronous to ensure delivery)
    cb.report_actual(
        intent_id=intent.intent_id,
        job_id="gemini-session-abc123",
        provider="google",
        api="gemini-3.1-flash-lite",
        actual_calls=500,
        actual_cost_usd=2.50,
        status="completed",
        sync=True,           # wait for the HTTP response
    )
    cb.flush()  # wait for any pending async reports to drain

The client is also usable as a context manager for automatic final
actual reporting:

    with cb.intent(
        job_id="scrape-phase1-la",
        provider="google",
        api="places-text-search",
        expected_calls=312,
        expected_cost_usd=10.0,
    ) as ctx:
        for query in queries:
            result = call_api(query)
            ctx.add_calls(1, cost_usd=0.032)
        # ctx reports "completed" on exit (or "failed" on exception)

Configuration via environment variables (all optional — constructor
args take precedence):
    CLOUDMANAGEMENT_URL          Base URL of the CloudManagement service
                                 (use the stable hostname, e.g.
                                 https://cloud.magicsolutions.biz)
    CLOUDMANAGEMENT_PROJECT_ID   Default project_id for this repo
    CLOUDMANAGEMENT_REPORT_TOKEN Default report token
    CLOUDMANAGEMENT_GATE_TOKEN   Shared secret for the Cloudflare Worker auth
                                 gate (sent as X-Gate-Token header). Required
                                 when base_url is the stable hostname
                                 cloud.magicsolutions.biz and the Worker has
                                 GATE_TOKEN configured. Stored in GCP Secret
                                 Manager as CLOUDMANAGEMENT_GATE_TOKEN.
    CLOUDMANAGEMENT_APPLICATION  Human-readable name of the calling app
                                 (e.g. "OSenseiArchiver"); recorded on
                                 every intent/actual report for attribution.
                                 Distinct from source_repo (the GitHub repo).
    CLOUDMANAGEMENT_TIMEOUT      HTTP timeout in seconds (default 5)
    CLOUDMANAGEMENT_INTENT_TIMEOUT  Timeout for declare_intent (default 3)
    CLOUDMANAGEMENT_STRICT       If "true", raise on errors instead of logging
    CLOUDMANAGEMENT_SPOOL_DIR    Directory for the durable on-disk spool
                                 (default: ~/.cache/cloud_management_client/spool).
                                 Set to empty string to disable spooling
                                 (read-only filesystems). See issue #12.
    CLOUDMANAGEMENT_SPOOL_CAP    Max spool entries before oldest are dropped
                                 with an ERROR log (default: 1000).
    CLOUDMANAGEMENT_SPOOL_MAX_ATTEMPTS  Max delivery attempts per entry
                                 before it is dropped with an ERROR (default: 10).
    CLOUDMANAGEMENT_SPOOL_MAX_AGE_SECONDS  Max age in seconds before an entry
                                 is dropped even if attempts remain (default: 86400).
    CLOUDMANAGEMENT_USE_IDENTITY If "true", fetch a GCP OIDC ID token from the
                                 metadata server and use it as the bearer
                                 credential instead of a shared report_token
                                 (issue #10). Falls back to report_token when
                                 not on GCP (local dev, OpenStack).

Errors are logged at WARNING and never raised — billing reporting is
best-effort and must not break the host application.  Set
CLOUDMANAGEMENT_STRICT=true to raise on errors instead.
"""

from __future__ import annotations

import json
import logging
import os
import queue
import random
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any

log = logging.getLogger("cloud_management_client")

__all__ = [
    "CloudManagementClient",
    "CloudManagementError",
    "IntentResponse",
    "ActualResponse",
    "BudgetCheck",
    "IntentContext",
    "JobKilledError",
    "KillOrder",
    "LocalCostHistory",
    "PriceChange",
]

__version__ = "0.13.0"


class CloudManagementError(Exception):
    """Raised when CLOUDMANAGEMENT_STRICT=true and a request fails."""


class JobKilledError(Exception):
    """Raised by IntentContext when the hub returns a kill directive.

    The host application should catch this in its job loop to perform
    cleanup and exit gracefully. The ``kill_order`` attribute carries the
    kill directive from the hub (a dict with ``kill_id``, ``intent_id``,
    ``job_id``, ``reason``, ``rule``, etc.).
    """

    def __init__(self, message: str, kill_order: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.kill_order = kill_order or {}


@dataclass
class KillOrder:
    """A kill order from the hub (client-polled kill channel, issue #13)."""
    kill_id: str = ""
    intent_id: str = ""
    project_id: str = ""
    job_id: str = ""
    reason: str = ""
    rule: str = ""
    kill_type: str = ""
    killed: bool = False
    detail: str = ""
    error: str = ""
    timestamp: str = ""
    raw: dict[str, Any] = field(default_factory=dict)


def _fail(msg: str, exc: Exception | None = None, strict: bool = False) -> None:
    """Log an error and optionally raise in strict mode."""
    detail = f"{msg}: {exc}" if exc else msg
    log.warning("cloud_management: %s", detail)
    if strict:
        raise CloudManagementError(detail) from exc


# ---------------------------------------------------------------------------
# Durable on-disk spool (issue #12)
# ---------------------------------------------------------------------------

_DEFAULT_SPOOL_DIR = os.path.expanduser("~/.cache/cloud_management_client/spool")


class _Spool:
    """Durable on-disk spool for report_actual entries.

    Each entry is a JSON file in ``spool_dir``. Entries are written before
    the HTTP attempt and deleted on confirmed delivery. On failure, the
    worker retries with exponential backoff and jitter, bounded by a max
    attempt count and a max spool age. On client startup, any entries left
    by a previous process are replayed.

    The spool is best-effort: all I/O errors are caught and logged at
    WARNING (or ERROR for drops). It never raises into the host application
    unless ``strict`` is True. Stdlib-only — no new dependencies.

    A ``client_seq`` (monotonic per intent) is stamped into each entry so
    the hub can reject stale replays that would overwrite a newer cumulative
    actual (see scenario 6 / issue #12).
    """

    def __init__(
        self,
        spool_dir: str,
        cap: int = 1000,
        max_attempts: int = 10,
        max_age_seconds: float = 86400.0,
        strict: bool = False,
    ) -> None:
        self.dir = spool_dir
        self.cap = cap
        self.max_attempts = max_attempts
        self.max_age_seconds = max_age_seconds
        self.strict = strict
        self._lock = threading.Lock()
        self._counter = 0
        self._enabled = bool(spool_dir)
        if self._enabled:
            self._ensure_dir()

    def _ensure_dir(self) -> None:
        """Create the spool directory if it doesn't exist. Best-effort."""
        try:
            os.makedirs(self.dir, exist_ok=True)
        except OSError as e:
            log.warning("cloud_management: spool dir unusable: %s", e)
            self._enabled = False

    def _next_id(self) -> str:
        """Generate a unique, sortable spool entry ID."""
        with self._lock:
            self._counter += 1
            return f"{time.time():.6f}_{os.getpid()}_{self._counter}"

    def write(self, path: str, payload: dict[str, Any], client_seq: int = 0) -> str | None:
        """Persist a report to the spool. Returns the entry ID, or None if
        the spool is disabled or unwritable. Enforces the cap by dropping
        oldest entries with an ERROR log."""
        if not self._enabled:
            return None
        entry_id = self._next_id()
        entry = {
            "id": entry_id,
            "path": path,
            "payload": payload,
            "client_seq": client_seq,
            "attempts": 0,
            "created_at": time.time(),
            "last_attempt_at": 0.0,
        }
        try:
            with self._lock:
                filepath = os.path.join(self.dir, f"{entry_id}.json")
                # Atomic write: write to temp then rename
                tmp = filepath + ".tmp"
                with open(tmp, "w", encoding="utf-8") as f:
                    json.dump(entry, f)
                os.rename(tmp, filepath)
                # Enforce cap after write so total never exceeds cap.
                self._enforce_cap()
            return entry_id
        except OSError as e:
            _fail("spool write failed", e, strict=self.strict)
            return None

    def _enforce_cap(self) -> None:
        """Drop oldest entries if the spool exceeds the cap. Caller holds _lock."""
        try:
            files = [f for f in os.listdir(self.dir) if f.endswith(".json")]
            if len(files) <= self.cap:
                return
            # Sort by filename (timestamp-prefixed → oldest first)
            files.sort()
            to_drop = len(files) - self.cap
            for f in files[:to_drop]:
                try:
                    os.remove(os.path.join(self.dir, f))
                    log.error("cloud_management: spool cap exceeded — dropped oldest entry %s", f)
                except OSError as e:
                    log.error("cloud_management: failed to drop spool entry %s: %s", f, e)
        except OSError as e:
            log.error("cloud_management: spool cap enforcement failed: %s", e)

    def read(self, entry_id: str) -> dict[str, Any] | None:
        """Read a spool entry. Returns None if not found or unreadable."""
        if not self._enabled:
            return None
        try:
            filepath = os.path.join(self.dir, f"{entry_id}.json")
            with open(filepath, "r", encoding="utf-8") as f:
                return json.load(f)
        except (OSError, json.JSONDecodeError) as e:
            _fail(f"spool read failed for {entry_id}", e, strict=self.strict)
            return None

    def remove(self, entry_id: str) -> None:
        """Delete a spool entry after confirmed delivery."""
        if not self._enabled:
            return
        try:
            os.remove(os.path.join(self.dir, f"{entry_id}.json"))
        except FileNotFoundError:
            pass  # already removed
        except OSError as e:
            _fail(f"spool remove failed for {entry_id}", e, strict=self.strict)

    def update_attempt(self, entry_id: str, attempts: int) -> None:
        """Update the attempt count and last_attempt_at for an entry."""
        if not self._enabled:
            return
        try:
            filepath = os.path.join(self.dir, f"{entry_id}.json")
            with open(filepath, "r", encoding="utf-8") as f:
                entry = json.load(f)
            entry["attempts"] = attempts
            entry["last_attempt_at"] = time.time()
            tmp = filepath + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(entry, f)
            os.rename(tmp, filepath)
        except (OSError, json.JSONDecodeError) as e:
            _fail(f"spool update failed for {entry_id}", e, strict=self.strict)

    def list_entries(self) -> list[str]:
        """Return all spool entry IDs, sorted oldest-first for replay."""
        if not self._enabled:
            return []
        try:
            files = [f[:-5] for f in os.listdir(self.dir) if f.endswith(".json")]
            files.sort()
            return files
        except OSError as e:
            _fail("spool list failed", e, strict=self.strict)
            return []

    def is_expired(self, entry: dict[str, Any]) -> bool:
        """Check if an entry has exceeded max_attempts or max_age."""
        if entry.get("attempts", 0) >= self.max_attempts:
            return True
        age = time.time() - entry.get("created_at", 0)
        if age > self.max_age_seconds:
            return True
        return False

    def drop(self, entry_id: str, reason: str) -> None:
        """Drop an entry with an ERROR log."""
        log.error("cloud_management: spool entry %s dropped: %s", entry_id, reason)
        self.remove(entry_id)


# ---------------------------------------------------------------------------
# Local cost history — client-side actual cost tracking (price-change feedback)
# ---------------------------------------------------------------------------

_DEFAULT_COST_HISTORY_DIR = os.path.expanduser(
    os.environ.get("CLOUDMANAGEMENT_COST_HISTORY_DIR", "~/.cache/cloud_management_client")
)
_DEFAULT_COST_HISTORY_FILE = "cost_history.json"
_DEFAULT_COST_HISTORY_WINDOW_DAYS = int(
    os.environ.get("CLOUDMANAGEMENT_COST_HISTORY_WINDOW_DAYS", "90")
)
_DEFAULT_PRICE_CHANGE_THRESHOLD = float(
    os.environ.get("CLOUDMANAGEMENT_PRICE_CHANGE_THRESHOLD", "0.15")
)


@dataclass
class PriceChange:
    """Detected price change for a (provider, api) pair.

    ``direction`` is "up", "down", or "stable".  ``pct`` is the percentage
    change from the baseline to the recent average (positive = price went up).
    """
    provider: str = ""
    api: str = ""
    baseline_unit_cost: float = 0.0
    recent_unit_cost: float = 0.0
    pct: float = 0.0
    direction: str = "stable"  # "up" | "down" | "stable"
    sample_count: int = 0


class LocalCostHistory:
    """Client-side actual cost tracking in a local JSON file.

    Records the actual cost of each completed API usage batch so that
    client algorithms can detect price changes over time and update their
    ``expected_cost_usd`` estimates for future intents.  This closes the
    feedback loop that CloudManagement's hub-side reconciliation leaves
    open: the hub recalibrates ``expected_costs`` on its side, but without
    a local record the client has no way to notice that its own cost
    assumptions have drifted from reality.

    The JSON file is structured as::

        {
          "records": {
            "<provider>::<api>": [
              {
                "timestamp": "2026-08-15T12:00:00Z",
                "calls": 100,
                "cost_usd": 3.50,
                "unit_cost_usd": 0.035
              },
              ...
            ]
          },
          "hub_expected": {
            "<provider>::<api>": {
              "unit_cost_usd": 0.035,
              "calibration_delta": -0.002,
              "updated_at": "2026-08-15T10:00:00Z"
            }
          }
        }

    The file is read/written atomically (write to temp, then rename).
    Records older than ``window_days`` (default 90) are pruned on each
    write.  All I/O is best-effort — errors are logged at WARNING and
    never raised (unless ``strict=True``).
    """

    def __init__(
        self,
        file_path: str | None = None,
        window_days: int | None = None,
        price_change_threshold: float | None = None,
        strict: bool = False,
    ) -> None:
        if file_path is not None:
            self.file_path = file_path
        else:
            self.file_path = os.path.join(
                _DEFAULT_COST_HISTORY_DIR, _DEFAULT_COST_HISTORY_FILE
            )
        self.window_days = window_days if window_days is not None else _DEFAULT_COST_HISTORY_WINDOW_DAYS
        self.price_change_threshold = (
            price_change_threshold
            if price_change_threshold is not None
            else _DEFAULT_PRICE_CHANGE_THRESHOLD
        )
        self.strict = strict
        self._lock = threading.Lock()
        self._cache: dict[str, Any] | None = None

    # --- file I/O ---

    def _load(self) -> dict[str, Any]:
        """Load the JSON file, returning an empty structure if missing or corrupt."""
        if self._cache is not None:
            return self._cache
        try:
            with open(self.file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if not isinstance(data, dict):
                data = {}
        except FileNotFoundError:
            data = {}
        except (json.JSONDecodeError, OSError) as exc:
            _fail(f"cost_history: failed to load {self.file_path}", exc, strict=self.strict)
            data = {}
        if "records" not in data:
            data["records"] = {}
        if "hub_expected" not in data:
            data["hub_expected"] = {}
        self._cache = data
        return data

    def _save(self, data: dict[str, Any]) -> None:
        """Atomically write the JSON file (temp + rename)."""
        try:
            os.makedirs(os.path.dirname(self.file_path) or ".", exist_ok=True)
            tmp = self.file_path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, sort_keys=True)
            os.replace(tmp, self.file_path)
            self._cache = data
        except OSError as exc:
            _fail(f"cost_history: failed to save {self.file_path}", exc, strict=self.strict)

    @staticmethod
    def _key(provider: str, api: str) -> str:
        return f"{provider}::{api}"

    # --- public API ---

    def record(
        self,
        provider: str,
        api: str,
        calls: int,
        cost_usd: float,
        timestamp: str | None = None,
    ) -> None:
        """Record a completed job's actual cost.

        Stores one entry per (provider, api) key.  Records older than
        ``window_days`` are pruned on each write.  ``calls=0`` entries are
        skipped (no meaningful unit cost).
        """
        if calls <= 0:
            return
        from datetime import datetime, timezone
        ts = timestamp or datetime.now(timezone.utc).isoformat()
        unit_cost = cost_usd / calls
        key = self._key(provider, api)
        with self._lock:
            data = self._load()
            records = data["records"]
            records.setdefault(key, []).append({
                "timestamp": ts,
                "calls": calls,
                "cost_usd": round(cost_usd, 6),
                "unit_cost_usd": round(unit_cost, 8),
            })
            self._prune(data)
            self._save(data)

    def update_hub_expected(
        self,
        provider: str,
        api: str,
        unit_cost_usd: float,
        calibration_delta: float = 0.0,
        updated_at: str = "",
    ) -> None:
        """Store the hub's authoritative expected cost for a provider/api.

        Called after pulling ``GET /api/v1/expected-costs/<project_id>``.
        The hub value is the calibrated baseline; local records are the
        observed reality.  ``suggest_expected_cost`` merges both.
        """
        key = self._key(provider, api)
        with self._lock:
            data = self._load()
            data["hub_expected"][key] = {
                "unit_cost_usd": round(unit_cost_usd, 8),
                "calibration_delta": round(calibration_delta, 8),
                "updated_at": updated_at,
            }
            self._save(data)

    def get_unit_cost(self, provider: str, api: str) -> float | None:
        """Return the recent average unit cost for a (provider, api) pair.

        Uses only records within ``window_days``.  Returns None if no
        records exist.
        """
        key = self._key(provider, api)
        with self._lock:
            data = self._load()
        records = data["records"].get(key, [])
        if not records:
            return None
        total_cost = sum(r["cost_usd"] for r in records)
        total_calls = sum(r["calls"] for r in records)
        if total_calls <= 0:
            return None
        return round(total_cost / total_calls, 8)

    def get_hub_unit_cost(self, provider: str, api: str) -> float | None:
        """Return the hub's authoritative unit cost, or None if not cached."""
        key = self._key(provider, api)
        with self._lock:
            data = self._load()
        entry = data["hub_expected"].get(key)
        if entry is None:
            return None
        return entry.get("unit_cost_usd")

    def suggest_expected_cost(
        self,
        provider: str,
        api: str,
        expected_calls: int,
    ) -> float | None:
        """Suggest an ``expected_cost_usd`` for a future intent.

        Preference order:
        1. Hub's authoritative unit cost (if cached from a recent pull)
           adjusted by its ``calibration_delta``.
        2. Local recent average unit cost (from recorded actuals).
        3. None (no data — caller must supply its own estimate).

        Returns ``expected_calls * suggested_unit_cost``, or None.
        """
        if expected_calls <= 0:
            return None
        key = self._key(provider, api)
        provider_key = self._key(provider, "")  # hub keys by provider only
        with self._lock:
            data = self._load()
        # 1. Hub authoritative — try exact (provider, api) match first,
        #    then fall back to provider-only key (hub stores per-provider).
        for lookup_key in (key, provider_key):
            hub = data["hub_expected"].get(lookup_key)
            if hub and hub.get("unit_cost_usd", 0) > 0:
                unit = hub["unit_cost_usd"] + hub.get("calibration_delta", 0)
                if unit > 0:
                    return round(unit * expected_calls, 4)
        # 2. Local recent average
        records = data["records"].get(key, [])
        if records:
            total_cost = sum(r["cost_usd"] for r in records)
            total_calls = sum(r["calls"] for r in records)
            if total_calls > 0:
                unit = total_cost / total_calls
                return round(unit * expected_calls, 4)
        # 3. No data
        return None

    def detect_price_changes(self) -> list[PriceChange]:
        """Detect price changes for all (provider, api) pairs with enough data.

        Compares the recent average unit cost (last 25% of the window) to
        the baseline average (first 75%).  A change is reported when the
        percentage difference exceeds ``price_change_threshold`` (default
        15%).  Returns a list of ``PriceChange`` objects.
        """
        from datetime import datetime, timedelta, timezone
        results: list[PriceChange] = []
        with self._lock:
            data = self._load()
            # Copy under the lock so concurrent record()/prune() can't
            # mutate the dict during iteration below.
            records_snapshot = dict(data["records"])
        cutoff = (datetime.now(timezone.utc) - timedelta(days=self.window_days)).isoformat()
        for key, records in records_snapshot.items():
            # Filter to window
            recent_records = [r for r in records if r["timestamp"] >= cutoff]
            if len(recent_records) < 4:
                continue  # need at least 4 samples to split into baseline + recent
            provider, api = key.split("::", 1) if "::" in key else (key, "")
            # Split: first 75% = baseline, last 25% = recent
            split_idx = max(1, int(len(recent_records) * 0.75))
            baseline_recs = recent_records[:split_idx]
            recent_recs = recent_records[split_idx:]
            baseline_calls = sum(r["calls"] for r in baseline_recs)
            recent_calls = sum(r["calls"] for r in recent_recs)
            if baseline_calls <= 0 or recent_calls <= 0:
                continue
            baseline_unit = sum(r["cost_usd"] for r in baseline_recs) / baseline_calls
            recent_unit = sum(r["cost_usd"] for r in recent_recs) / recent_calls
            if baseline_unit <= 0:
                continue
            pct = (recent_unit - baseline_unit) / baseline_unit
            direction = "stable"
            if abs(pct) > self.price_change_threshold:
                direction = "up" if pct > 0 else "down"
            results.append(PriceChange(
                provider=provider,
                api=api,
                baseline_unit_cost=round(baseline_unit, 8),
                recent_unit_cost=round(recent_unit, 8),
                pct=round(pct * 100, 2),
                direction=direction,
                sample_count=len(recent_records),
            ))
        return results

    def _prune(self, data: dict[str, Any]) -> None:
        """Remove records older than ``window_days``."""
        from datetime import datetime, timedelta, timezone
        cutoff = (datetime.now(timezone.utc) - timedelta(days=self.window_days)).isoformat()
        for key in list(data["records"].keys()):
            data["records"][key] = [
                r for r in data["records"][key] if r["timestamp"] >= cutoff
            ]
            if not data["records"][key]:
                del data["records"][key]

    def clear(self) -> None:
        """Clear all records (useful for tests)."""
        with self._lock:
            self._cache = {"records": {}, "hub_expected": {}}
            self._save(self._cache)


@dataclass
class IntentResponse:
    """Response from POST /api/v1/intent."""
    intent_id: str = ""
    approved: bool = False
    deferred: bool = False
    budget_remaining_usd: float = 0.0
    budget_short_usd: float = 0.0
    suggested_retry_at: str = ""
    kill_switch_armed: bool = False
    reason: str = ""
    warnings: list[str] = field(default_factory=list)
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass
class ActualResponse:
    """Response from POST /api/v1/actual."""
    actual_id: str = ""
    overrun_detected: bool = False
    status: str = ""
    overrun: dict[str, Any] = field(default_factory=dict)
    kill_result: dict[str, Any] = field(default_factory=dict)
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass
class BudgetCheck:
    """Response from GET/POST /api/v1/budget/<project_id>.

    A side-effect-free budget admission probe (budget-informed runtimes).
    ``admit`` is the bottom-line decision: True iff the projected cost
    fits within the project's remaining monthly budget. ``deferred`` is
    True when the cost would push the project over (vs ``admit=False``
    with ``deferred=False`` when the project is already over budget).
    """
    admit: bool = False
    deferred: bool = False
    reason: str = ""
    budget_configured: bool = False
    budget_amount_usd: float = 0.0
    spent_this_month_usd: float = 0.0
    budget_remaining_usd: float = 0.0
    budget_short_usd: float = 0.0
    suggested_retry_at: str = ""
    over_budget: bool = False
    raw: dict[str, Any] = field(default_factory=dict)


class CloudManagementClient:
    """Client for the CloudManagement intent/actual reporting protocol.

    All methods are best-effort: errors are logged at WARNING and the
    method returns a failure response object rather than raising
    (unless CLOUDMANAGEMENT_STRICT=true).

    ``report_actual`` is asynchronous by default — it enqueues the HTTP
    request to a background daemon thread so it never blocks the caller.
    Use ``sync=True`` for the final "completed"/"failed" report, and call
    ``flush()`` to wait for pending async reports to drain (e.g. at
    shutdown).

    ``declare_intent`` is always synchronous because the caller needs
    the response to check ``.approved``.
    """

    def __init__(
        self,
        project_id: str = "",
        report_token: str = "",
        base_url: str = "",
        source_repo: str = "",
        application: str = "",
        timeout: int | None = None,
        intent_timeout: int | None = None,
        strict: bool | None = None,
        spool_dir: str | None = None,
        use_identity: bool | None = None,
        gate_token: str = "",
        cost_history_file: str | None = None,
    ) -> None:
        self.project_id = project_id or os.environ.get("CLOUDMANAGEMENT_PROJECT_ID", "")
        self.report_token = report_token or os.environ.get("CLOUDMANAGEMENT_REPORT_TOKEN", "")
        self.base_url = (base_url or os.environ.get("CLOUDMANAGEMENT_URL", "http://127.0.0.1:8080")).rstrip("/")
        self.gate_token = gate_token or os.environ.get("CLOUDMANAGEMENT_GATE_TOKEN", "")
        self.source_repo = source_repo
        # Human-readable name of the calling application (e.g. "OSenseiArchiver"),
        # distinct from source_repo (the GitHub repo, e.g. "biofool/OSenseiDocuments").
        # Recorded on every intent/actual report for attribution in the dashboard.
        self.application = application or os.environ.get("CLOUDMANAGEMENT_APPLICATION", "")
        self.timeout = timeout if timeout is not None else int(os.environ.get("CLOUDMANAGEMENT_TIMEOUT", "5"))
        self.intent_timeout = intent_timeout if intent_timeout is not None else int(os.environ.get("CLOUDMANAGEMENT_INTENT_TIMEOUT", "3"))
        self.strict = strict if strict is not None else os.environ.get("CLOUDMANAGEMENT_STRICT", "false").lower() == "true"

        # Durable on-disk spool for report_actual (issue #12). Set
        # CLOUDMANAGEMENT_SPOOL_DIR="" to disable (read-only filesystems).
        if spool_dir is not None:
            _spool_dir = spool_dir
        else:
            _spool_dir = os.environ.get("CLOUDMANAGEMENT_SPOOL_DIR", _DEFAULT_SPOOL_DIR)
        self._spool = _Spool(
            spool_dir=_spool_dir,
            cap=int(os.environ.get("CLOUDMANAGEMENT_SPOOL_CAP", "1000")),
            max_attempts=int(os.environ.get("CLOUDMANAGEMENT_SPOOL_MAX_ATTEMPTS", "10")),
            max_age_seconds=float(os.environ.get("CLOUDMANAGEMENT_SPOOL_MAX_AGE_SECONDS", "86400")),
            strict=self.strict,
        )

        # Identity-token mode (issue #10): when True, the client fetches a GCP
        # OIDC ID token from the metadata server scoped to base_url and sends
        # it as the bearer credential instead of a shared report_token. This
        # eliminates the need to create/distribute/rotate a shared secret for
        # GCP-resident clients. Falls back to report_token if the metadata
        # server is unreachable (local dev, OpenStack).
        if use_identity is not None:
            self.use_identity = use_identity
        else:
            self.use_identity = os.environ.get("CLOUDMANAGEMENT_USE_IDENTITY", "false").lower() == "true"
        self._id_token: str | None = None
        self._id_token_expiry: float = 0.0

        # Per-intent monotonic client_seq — stamped into each report so the
        # hub can reject stale replays that would overwrite a newer cumulative
        # actual (scenario 6 / issue #12).
        self._client_seq: dict[str, int] = {}
        self._seq_lock = threading.Lock()

        # Background queue for async report_actual calls. Items are spool
        # entry IDs (or None as the stop sentinel).
        self._queue: queue.Queue[str | None] = queue.Queue()
        self._worker: threading.Thread | None = None
        self._worker_lock = threading.Lock()
        # Transient in-memory entries for when the spool is disabled.
        self._inline_entries: dict[str, dict[str, Any]] = {}

        # Local cost history — records actual costs in a local JSON file so
        # client algorithms can detect price changes over time and refine
        # future expected_cost_usd estimates. Set CLOUDMANAGEMENT_COST_HISTORY_FILE
        # to "" to disable (read-only filesystems).
        _ch_file = cost_history_file
        if _ch_file is None:
            _ch_file = os.environ.get("CLOUDMANAGEMENT_COST_HISTORY_FILE", "")
            if not _ch_file:
                _ch_file = os.path.join(_DEFAULT_COST_HISTORY_DIR, _DEFAULT_COST_HISTORY_FILE)
        self.cost_history: LocalCostHistory | None = None
        if _ch_file:
            try:
                self.cost_history = LocalCostHistory(
                    file_path=_ch_file,
                    strict=self.strict,
                )
            except Exception as exc:
                _fail("cloud_management: cost_history init failed", exc, strict=self.strict)

        if not self.project_id:
            log.warning("cloud_management: project_id not set — client disabled")
        if not self.report_token and not self.use_identity:
            log.warning("cloud_management: report_token not set and use_identity=False — client disabled")

    @property
    def enabled(self) -> bool:
        # In identity mode, the token is fetched at request time from the
        # metadata server, so report_token is not required.
        return bool(self.project_id and (self.report_token or self.use_identity))

    # ------------------------------------------------------------------
    # Background worker for async report_actual
    # ------------------------------------------------------------------

    def _ensure_worker(self) -> None:
        """Start the background worker thread if not already running.

        Also replays any spool entries left by a previous process — this is
        the headline scenario for issue #12 (test_spool_survives_process_restart).
        """
        if self._worker is not None and self._worker.is_alive():
            return
        with self._worker_lock:
            if self._worker is not None and self._worker.is_alive():
                return
            # Replay spool entries from a previous process before starting
            # the worker, so they are processed in order.
            for entry_id in self._spool.list_entries():
                self._queue.put(entry_id)
            self._worker = threading.Thread(
                target=self._worker_loop,
                name="cloud-management-reporter",
                daemon=True,
            )
            self._worker.start()

    def _sleep(self, seconds: float) -> None:
        """Indirection so tests can mock sleep without actually waiting."""
        time.sleep(seconds)

    def _worker_loop(self) -> None:
        """Process queued report_actual requests with spool-backed retry."""
        while True:
            entry_id = self._queue.get()
            if entry_id is None:
                # Sentinel — signal to stop
                self._queue.task_done()
                break
            try:
                self._process_spool_entry(entry_id)
            except Exception as e:
                _fail("async report_actual failed", e, strict=self.strict)
            finally:
                self._queue.task_done()

    def _process_spool_entry(self, entry_id: str) -> None:
        """Attempt to deliver a spool entry, retrying with backoff on failure.

        Handles both on-disk spool entries and transient in-memory entries
        (used when the spool is disabled).
        """
        # Inline (spool disabled) — single attempt, no retry.
        if entry_id.startswith("inline_"):
            entry = self._inline_entries.pop(entry_id, None)
            if entry is None:
                return
            self._post_sync(entry["path"], entry["payload"])
            return

        entry = self._spool.read(entry_id)
        if entry is None:
            return  # entry was lost or corrupted — nothing to deliver
        attempts = entry.get("attempts", 0)
        while True:
            data = self._post_sync(entry["path"], entry["payload"])
            if data is not None:
                # Confirmed delivery — remove from spool.
                self._spool.remove(entry_id)
                return
            attempts += 1
            self._spool.update_attempt(entry_id, attempts)
            if self._spool.is_expired({**entry, "attempts": attempts}):
                self._spool.drop(entry_id, f"max attempts ({attempts}) or max age exceeded")
                return
            # Exponential backoff with jitter: base * 2^(attempts-1) + random
            backoff = min(1.0 * (2 ** (attempts - 1)) + random.uniform(0, 1), 60.0)
            self._sleep(backoff)

    def flush(self, timeout: float = 5.0) -> None:
        """Wait for all pending async report_actual calls to complete.

        Blocks until the queue is drained or ``timeout`` seconds elapse.
        If the timeout expires, pending reports are NOT lost — they remain
        in the on-disk spool and are replayed on the next client startup
        (issue #12). The daemon worker thread will also continue processing
        them if the process stays alive.
        """
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            # all_tasks_done is an internal Condition; wait briefly
            if self._queue.all_tasks_done.acquire(timeout=0.1):
                try:
                    if self._queue.unfinished_tasks == 0:
                        return
                finally:
                    self._queue.all_tasks_done.release()
            else:
                continue
        # Timeout expired — pending items remain in the spool for replay

    def close(self) -> None:
        """Signal the background worker to stop and wait briefly."""
        self._queue.put(None)
        if self._worker is not None:
            self._worker.join(timeout=2.0)

    # ------------------------------------------------------------------
    # Low-level HTTP
    # ------------------------------------------------------------------

    def _get_identity_token(self) -> str | None:
        """Fetch a GCP OIDC ID token scoped to base_url (issue #10).

        Uses the metadata server's identity endpoint with the hub's URL as
        the audience. The token is cached until 60s before expiry. Returns
        None if not on GCP or the metadata server is unreachable — the
        caller falls back to the shared report_token in that case.
        """
        # Return cached token if still valid (with a 60s safety margin).
        if self._id_token and time.time() < self._id_token_expiry - 60:
            return self._id_token
        try:
            audience = self.base_url
            url = (
                "http://metadata.google.internal/computeMetadata/v1/instance/"
                f"service-accounts/default/identity?audience={audience}"
            )
            req = urllib.request.Request(url, headers={"Metadata-Flavor": "Google"})
            with urllib.request.urlopen(req, timeout=2) as resp:
                token = resp.read().decode("utf-8").strip()
                if not token:
                    return None
                # Decode the JWT payload to get the expiry (no verification —
                # the metadata server is trusted in this context).
                try:
                    payload_b64 = token.split(".")[1]
                    # Add padding for base64 decode
                    payload_b64 += "=" * (4 - len(payload_b64) % 4)
                    payload = json.loads(
                        __import__("base64").urlsafe_b64decode(payload_b64)
                    )
                    self._id_token_expiry = float(payload.get("exp", 0))
                except Exception:
                    # If we can't decode the expiry, assume a short lifetime.
                    self._id_token_expiry = time.time() + 300
                self._id_token = token
                return token
        except Exception as e:
            log.warning("cloud_management: identity token fetch failed: %s", e)
            return None

    def _auth_token(self) -> str:
        """Return the bearer token for the current request.

        In identity mode, fetches an ID token from the metadata server; if
        that fails (not on GCP), falls back to the shared report_token.
        In shared-token mode, returns the report_token directly.
        """
        if self.use_identity:
            token = self._get_identity_token()
            if token:
                return token
            # Fall back to shared token (local dev, OpenStack).
            log.warning("cloud_management: identity token unavailable, falling back to report_token")
        return self.report_token

    def _gate_headers(self) -> dict[str, str]:
        """Return extra headers for the Cloudflare Worker auth gate.

        When ``gate_token`` is set, the Worker in front of
        cloud.magicsolutions.biz requires ``X-Gate-Token`` on every request
        (except GET /health). This header is ignored by the hub's
        application layer — it's only consumed by the Worker.

        Returns an empty dict when no gate token is configured (local dev,
        direct Cloud Run access, etc.).
        """
        if self.gate_token:
            return {"X-Gate-Token": self.gate_token}
        return {}

    def _post_sync(self, path: str, payload: dict[str, Any], timeout: int | None = None) -> dict[str, Any] | None:
        """Synchronous HTTP POST. Returns parsed JSON or None on error."""
        if not self.enabled:
            return None
        url = f"{self.base_url}{path}"
        body = json.dumps(payload).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self._auth_token()}",
        }
        headers.update(self._gate_headers())
        req = urllib.request.Request(
            url,
            data=body,
            headers=headers,
            method="POST",
        )
        t = timeout if timeout is not None else self.timeout
        try:
            with urllib.request.urlopen(req, timeout=t) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            err_body = ""
            try:
                err_body = e.read().decode("utf-8")[:200]
            except Exception:
                pass
            _fail(f"POST {path} failed (HTTP {e.code}): {err_body}", strict=self.strict)
            return None
        except urllib.error.URLError as e:
            _fail(f"POST {path} connection error", e, strict=self.strict)
            return None
        except Exception as e:
            _fail(f"POST {path} unexpected error", e, strict=self.strict)
            return None

    def _get_sync(self, path: str, timeout: int | None = None) -> dict[str, Any] | None:
        """Synchronous HTTP GET. Returns parsed JSON or None on error."""
        if not self.enabled:
            return None
        url = f"{self.base_url}{path}"
        headers = {
            "Authorization": f"Bearer {self._auth_token()}",
        }
        headers.update(self._gate_headers())
        req = urllib.request.Request(
            url,
            headers=headers,
            method="GET",
        )
        t = timeout if timeout is not None else self.timeout
        try:
            with urllib.request.urlopen(req, timeout=t) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            err_body = ""
            try:
                err_body = e.read().decode("utf-8")[:200]
            except Exception:
                pass
            _fail(f"GET {path} failed (HTTP {e.code}): {err_body}", strict=self.strict)
            return None
        except urllib.error.URLError as e:
            _fail(f"GET {path} connection error", e, strict=self.strict)
            return None
        except Exception as e:
            _fail(f"GET {path} unexpected error", e, strict=self.strict)
            return None

    # ------------------------------------------------------------------
    # Intent / Actual API
    # ------------------------------------------------------------------

    def declare_intent(
        self,
        job_id: str,
        provider: str = "",
        api: str = "",
        expected_calls: int = 0,
        expected_cost_usd: float = 0.0,
        expected_tokens: int | None = None,
        rate_limit_rpm: int = 0,
        job_name: str = "",
        window_start: str = "",
        window_end: str = "",
        kill: dict[str, Any] | None = None,
        metadata: dict[str, Any] | None = None,
        source_repo: str = "",
        application: str = "",
        intent_id: str = "",
    ) -> IntentResponse:
        """Declare expected API usage before making calls.

        Always synchronous — the caller needs the response to check
        ``.approved`` before proceeding.

        Returns an IntentResponse with .approved indicating whether
        the intent was accepted (budget not yet exceeded).
        """
        payload: dict[str, Any] = {
            "project_id": self.project_id,
            "job_id": job_id,
            "job_name": job_name,
            "provider": provider,
            "api": api,
            "expected_calls": expected_calls,
            "expected_cost_usd": expected_cost_usd,
            "rate_limit_rpm": rate_limit_rpm,
            "source_repo": source_repo or self.source_repo,
            "application": application or self.application,
        }
        if expected_tokens is not None:
            payload["expected_tokens"] = expected_tokens
        if window_start:
            payload["window_start"] = window_start
        if window_end:
            payload["window_end"] = window_end
        if kill:
            payload["kill"] = kill
        if metadata:
            payload["metadata"] = metadata
        if intent_id:
            payload["intent_id"] = intent_id

        data = self._post_sync("/api/v1/intent", payload, timeout=self.intent_timeout)
        if data is None:
            return IntentResponse()
        return IntentResponse(
            intent_id=data.get("intent_id", ""),
            approved=data.get("approved", False),
            deferred=data.get("deferred", False),
            budget_remaining_usd=float(data.get("budget_remaining_usd", 0)),
            budget_short_usd=float(data.get("budget_short_usd", 0)),
            suggested_retry_at=data.get("suggested_retry_at", ""),
            kill_switch_armed=data.get("kill_switch_armed", False),
            reason=data.get("reason", ""),
            warnings=data.get("warnings", []),
            raw=data,
        )

    def get_intent(self, intent_id: str) -> dict[str, Any] | None:
        """Fetch a single intent by ID (Issue #39).

        Used by ``wait_for_reschedule`` and by callers that poll for
        status changes. Returns the full intent dict, or None on error.
        No project-scoped auth — the intent_id is an unguessable token.
        """
        return self._get_sync(f"/api/v1/intent/{intent_id}")

    def wait_for_reschedule(
        self,
        intent_id: str,
        timeout: float = 3600.0,
        poll_interval: float = 60.0,
    ) -> dict[str, Any] | None:
        """Poll ``GET /api/v1/intent/<intent_id>`` until the deferred intent
        is rescheduled (``status: scheduled``) or expired/failed, or
        ``timeout`` seconds elapse (Issue #39).

        Returns the final intent dict on status change, or None on
        timeout/error. This is the poll-based fallback for clients that
        cannot receive webhook callbacks — the primary notify mechanism
        is the ``resume_callback`` webhook (see reschedule.py).

        Blocks the calling thread; use from a background thread if the
        caller needs to continue other work.
        """
        import time as _time
        deadline = _time.monotonic() + timeout
        while _time.monotonic() < deadline:
            data = self._get_sync(f"/api/v1/intent/{intent_id}")
            if data is None:
                return None
            status = data.get("status", "")
            if status != "deferred":
                return data
            _time.sleep(poll_interval)
        log.warning("cloud_management: wait_for_reschedule timed out after %ss for %s", timeout, intent_id)
        return None

    def check_budget(self, expected_cost_usd: float = 0.0) -> BudgetCheck:
        """Pre-flight budget admission probe (budget-informed runtimes).

        Asks the hub "can I afford ``expected_cost_usd`` of work right now?"
        WITHOUT persisting an intent — the side-effect-free counterpart to
        ``declare_intent``'s deferral path. Use this before deciding which
        batch to run, whether to pull a queue, or whether to fire a cron
        job, so a runtime can pick budget-feasible work instead of
        declaring an intent that gets deferred (or killed mid-run).

        - ``expected_cost_usd > 0`` → POST admission decision
          (``admit`` / ``deferred`` / ``reason`` / ``suggested_retry_at``).
        - ``expected_cost_usd == 0`` (default) → GET read-only budget
          status (``budget_remaining_usd`` / ``over_budget``); ``admit``
          is True iff the project is not over budget.

        Always synchronous. On error returns a BudgetCheck with
        ``admit=False`` (fail-closed: when the hub is unreachable, do not
        start cost-incurring work on the assumption budget is available).
        """
        path = f"/api/v1/budget/{self.project_id}"
        if expected_cost_usd and expected_cost_usd > 0:
            data = self._post_sync(path, {"expected_cost_usd": expected_cost_usd},
                                   timeout=self.intent_timeout)
        else:
            data = self._get_sync(path, timeout=self.intent_timeout)
        if data is None:
            # Fail-closed: unknown budget state → do not admit.
            return BudgetCheck(admit=False, reason="budget_check_unavailable")
        if expected_cost_usd and expected_cost_usd > 0:
            return BudgetCheck(
                admit=bool(data.get("admit", False)),
                deferred=bool(data.get("deferred", False)),
                reason=data.get("reason", ""),
                budget_configured=bool(data.get("budget_configured", False)),
                budget_amount_usd=float(data.get("budget_amount_usd", 0)),
                spent_this_month_usd=float(data.get("spent_this_month_usd", 0)),
                budget_remaining_usd=float(data.get("budget_remaining_usd", 0)),
                budget_short_usd=float(data.get("budget_short_usd", 0)),
                suggested_retry_at=data.get("suggested_retry_at", ""),
                raw=data,
            )
        # GET status response — derive admit from over_budget.
        over = bool(data.get("over_budget", False))
        configured = bool(data.get("budget_configured", False))
        return BudgetCheck(
            admit=not over,
            deferred=False,
            budget_configured=configured,
            budget_amount_usd=float(data.get("budget_amount_usd", 0)),
            spent_this_month_usd=float(data.get("spent_this_month_usd", 0)),
            budget_remaining_usd=float(data.get("budget_remaining_usd", 0)),
            over_budget=over,
            raw=data,
        )

    def can_run(self, expected_cost_usd: float) -> bool:
        """Convenience wrapper around ``check_budget`` — True iff the
        projected cost is admissible right now. Fail-closed on error."""
        return self.check_budget(expected_cost_usd).admit

    # ------------------------------------------------------------------
    # Expected-cost pull + local cost history (price-change feedback)
    # ------------------------------------------------------------------

    def get_expected_costs(self) -> dict[str, Any] | None:
        """Pull authoritative expected costs from the hub.

        Calls ``GET /api/v1/expected-costs/<project_id>`` and caches the
        results into the local cost history so that
        ``suggest_expected_cost`` can use the hub's calibrated pricing.
        Returns the raw hub response dict, or None on error.

        Sub-projects should call this on a schedule (e.g. every 15 min
        via Cloud Scheduler) to keep local pricing in sync with the hub's
        reconciliation-derived calibration deltas.
        """
        if not self.enabled:
            return None
        data = self._get_sync(f"/api/v1/expected-costs/{self.project_id}")
        if data is None:
            return None
        # Cache hub expected costs into local cost history
        if self.cost_history:
            updated_at = data.get("updated_at", "")
            for provider, info in (data.get("providers") or {}).items():
                unit_cost = float(info.get("unit_cost_usd", 0))
                cal_delta = float(info.get("calibration_delta", 0))
                # The hub keys by provider only; we store with an empty api
                # so it acts as the provider-level baseline.
                self.cost_history.update_hub_expected(
                    provider=provider,
                    api="",
                    unit_cost_usd=unit_cost,
                    calibration_delta=cal_delta,
                    updated_at=updated_at,
                )
        return data

    def suggest_expected_cost(
        self,
        provider: str,
        api: str,
        expected_calls: int,
    ) -> float | None:
        """Suggest an ``expected_cost_usd`` for a future intent.

        Merges local observed costs with the hub's authoritative pricing
        (if cached via ``get_expected_costs``).  Preference order:

        1. Hub's calibrated unit cost (if cached).
        2. Local recent average unit cost (from recorded actuals).
        3. None — no data available; caller must supply its own estimate.

        This lets client algorithms auto-adjust their cost estimates as
        prices change over time, without waiting for the hub to kill a
        job that exceeded a stale estimate.
        """
        if not self.cost_history:
            return None
        return self.cost_history.suggest_expected_cost(provider, api, expected_calls)

    def detect_price_changes(self) -> list[PriceChange]:
        """Detect price changes from local cost history.

        Returns a list of ``PriceChange`` objects for (provider, api)
        pairs where the recent average unit cost has diverged from the
        baseline by more than ``price_change_threshold`` (default 15%).
        Client algorithms can use this to proactively update their
        pricing assumptions before declaring an intent with a stale
        ``expected_cost_usd``.
        """
        if not self.cost_history:
            return []
        return self.cost_history.detect_price_changes()

    def report_exposure(
        self,
        display_name: str = "",
        all_keys: bool = True,
        dry_run: bool = False,
        enable_api: bool = False,
    ) -> dict[str, Any] | None:
        """Report that an API key has been exposed and request rotation.

        Returns the server response including new key string(s) on success.
        Errors are logged and returned as None (or raise in strict mode).
        """
        if not self.enabled:
            return None
        payload: dict[str, Any] = {
            "project_id": self.project_id,
            "display_name": display_name,
            "all": all_keys,
            "dry_run": dry_run,
            "enable_api": enable_api,
        }
        return self._post_sync("/api/v1/exposure", payload)

    def report_actual(
        self,
        intent_id: str,
        job_id: str = "",
        provider: str = "",
        api: str = "",
        actual_calls: int = 0,
        actual_cost_usd: float = 0.0,
        actual_tokens: int | None = None,
        status: str = "completed",  # "running" | "completed" | "failed"
        started_at: str = "",
        ended_at: str = "",
        application: str = "",
        sync: bool = False,
    ) -> ActualResponse:
        """Report actual API usage (post-call or incremental).

        By default, this is **asynchronous** — the HTTP request is
        enqueued to a background daemon thread so it never blocks the
        caller.  This is important for per-call reporting from hot
        paths (e.g. every Gemini API call).

        For the **final** report (status="completed" or "failed"), pass
        ``sync=True`` to get the response synchronously, and call
        ``flush()`` afterwards to ensure all prior async reports have
        been delivered.

        Returns an ActualResponse.  In async mode (default), the
        response is a placeholder — the actual HTTP happens in the
        background.
        """
        # Stamp a monotonic client_seq per intent so the hub can reject
        # stale replays that would overwrite a newer cumulative actual
        # (scenario 6 / issue #12).
        with self._seq_lock:
            seq = self._client_seq.get(intent_id, 0) + 1
            self._client_seq[intent_id] = seq

        payload: dict[str, Any] = {
            "project_id": self.project_id,
            "intent_id": intent_id,
            "job_id": job_id,
            "provider": provider,
            "api": api,
            "actual_calls": actual_calls,
            "actual_cost_usd": actual_cost_usd,
            "status": status,
            "application": application or self.application,
            "client_seq": seq,
        }
        if actual_tokens is not None:
            payload["actual_tokens"] = actual_tokens
        if started_at:
            payload["started_at"] = started_at
        if ended_at:
            payload["ended_at"] = ended_at

        if sync or not self.enabled:
            # Persist to spool before the HTTP attempt so a crash mid-send
            # doesn't lose the report. On success, remove from spool.
            entry_id = self._spool.write("/api/v1/actual", payload, client_seq=seq)
            data = self._post_sync("/api/v1/actual", payload)
            if data is not None and entry_id is not None:
                self._spool.remove(entry_id)
            if data is None:
                return ActualResponse()
            return ActualResponse(
                actual_id=data.get("actual_id", ""),
                overrun_detected=data.get("overrun_detected", False),
                status=data.get("status", ""),
                overrun=data.get("overrun", {}),
                kill_result=data.get("kill_result", {}),
                raw=data,
            )
        else:
            # Async — persist to spool, then enqueue the entry ID to the
            # background worker. The worker retries with backoff on failure.
            entry_id = self._spool.write("/api/v1/actual", payload, client_seq=seq)
            self._ensure_worker()
            if entry_id is not None:
                self._queue.put(entry_id)
            else:
                # Spool disabled — fall back to direct enqueue (best-effort,
                # no retry, matches pre-#12 behaviour).
                self._queue.put(self._inline_entry("/api/v1/actual", payload))
            return ActualResponse()  # placeholder — actual HTTP happens in background

    def _inline_entry(self, path: str, payload: dict[str, Any]) -> str:
        """When the spool is disabled, create a transient in-memory entry
        that the worker processes without persistence or retry."""
        entry_id = f"inline_{time.time():.6f}_{os.getpid()}"
        self._inline_entries[entry_id] = {"path": path, "payload": payload}
        return entry_id

    # ------------------------------------------------------------------
    # Client-polled kill orders (issue #13)
    # ------------------------------------------------------------------

    def check_kill_orders(self, since: str = "") -> list[KillOrder]:
        """Poll the hub for kill orders targeting this project.

        Returns a list of ``KillOrder`` objects. An empty list means no
        kill orders (the job should continue). This is the inverted kill
        channel — instead of the hub pushing to a callback URL, the
        client polls. Use this between reports for long-running jobs.

        ``since`` is an ISO 8601 timestamp; only orders at or after this
        time are returned. Pass the timestamp of the last order seen to
        avoid re-processing.
        """
        if not self.enabled:
            return []
        params = f"project_id={self.project_id}"
        if since:
            params += f"&since={since}"
        data = self._get_sync(f"/api/v1/kill-orders?{params}")
        if data is None:
            return []
        orders = []
        for raw_order in data.get("kill_orders", []):
            try:
                orders.append(KillOrder(
                    kill_id=raw_order.get("kill_id", ""),
                    intent_id=raw_order.get("intent_id", ""),
                    project_id=raw_order.get("project_id", ""),
                    job_id=raw_order.get("job_id", ""),
                    reason=raw_order.get("reason", ""),
                    rule=raw_order.get("rule", ""),
                    kill_type=raw_order.get("kill_type", ""),
                    killed=bool(raw_order.get("killed", False)),
                    detail=raw_order.get("detail", ""),
                    error=raw_order.get("error", ""),
                    timestamp=raw_order.get("timestamp", ""),
                    raw=raw_order,
                ))
            except Exception as e:
                log.warning("cloud_management: malformed kill order ignored: %s", e)
        return orders

    # ------------------------------------------------------------------
    # Context manager for automatic intent/actual lifecycle
    # ------------------------------------------------------------------

    def intent(
        self,
        job_id: str,
        **kwargs: Any,
    ) -> "IntentContext":
        """Context manager that declares an intent and reports the
        final actual on exit.

        Usage:
            with cb.intent(job_id="x", provider="google",
                           expected_calls=100, expected_cost_usd=1.0) as ctx:
                for q in queries:
                    call_api(q)
                    ctx.add_calls(1, cost_usd=0.01)
                # on normal exit: reports "completed" (sync=True)
                # on exception: reports "failed" (sync=True)
        """
        return IntentContext(self, job_id, **kwargs)


class IntentContext:
    """Context manager for an intent/actual lifecycle."""

    def __init__(
        self,
        client: CloudManagementClient,
        job_id: str,
        **intent_kwargs: Any,
    ) -> None:
        self._client = client
        self._job_id = job_id
        self._intent_kwargs = intent_kwargs
        self.intent: IntentResponse | None = None
        self._calls = 0
        self._cost = 0.0
        self._tokens: int | None = None
        self._start = time.time()
        self._reported = False

    def __enter__(self) -> "IntentContext":
        if not self._client.enabled:
            log.debug("cloud_management: client disabled, skipping intent")
            return self
        self.intent = self._client.declare_intent(
            job_id=self._job_id, **self._intent_kwargs
        )
        if not self.intent.approved:
            _fail(f"intent denied for {self._job_id}: {self.intent.reason}", strict=self._client.strict)
        return self

    def add_calls(self, calls: int, cost_usd: float = 0.0, tokens: int | None = None) -> None:
        """Accumulate usage during the job. Call after each API call."""
        self._calls += calls
        self._cost += cost_usd
        if tokens is not None:
            self._tokens = (self._tokens or 0) + tokens

    def report_incremental(self, status: str = "running", sync: bool = False) -> ActualResponse:
        """Send an incremental actual report mid-job.

        By default async (returns a placeholder). Pass ``sync=True`` to
        get the response synchronously — this is required for kill-order
        detection (the hub returns the kill directive on the response).

        If the hub returns a kill directive (overrun detected, budget
        exceeded, or a manual kill), this method raises ``JobKilledError``
        so the host application's own cleanup runs. The error is not
        raised in async mode (the placeholder response has no kill data).
        """
        if not self.intent or not self.intent.intent_id:
            return ActualResponse()
        resp = self._client.report_actual(
            intent_id=self.intent.intent_id,
            job_id=self._job_id,
            provider=self._intent_kwargs.get("provider", ""),
            api=self._intent_kwargs.get("api", ""),
            actual_calls=self._calls,
            actual_cost_usd=self._cost,
            actual_tokens=self._tokens,
            status=status,
            sync=sync,
        )
        # Check for kill directive in the response (only available in sync mode).
        if sync and resp.kill_result:
            kr = resp.kill_result
            if isinstance(kr, dict) and kr.get("killed"):
                raise JobKilledError(
                    f"job {self._job_id} killed by hub: {kr.get('reason', kr.get('rule', 'unknown'))}",
                    kill_order=kr,
                )
        return resp

    def check_kill_orders(self, since: str = "") -> list[KillOrder]:
        """Poll the hub for kill orders targeting this intent's project.

        Use this between reports for long-running jobs that need faster
        kill detection than the report cadence provides. Returns a list
        of ``KillOrder`` objects; an empty list means no kill orders.
        """
        if not self.intent or not self.intent.intent_id:
            return []
        return self._client.check_kill_orders(since=since)

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        if not self._client.enabled or not self.intent or not self.intent.intent_id:
            return
        if self._reported:
            return
        # If the job was killed via JobKilledError, report "killed" status.
        # If another exception occurred, report "failed". Otherwise "completed".
        if exc_type is not None and isinstance(exc_val, JobKilledError):
            status = "killed"
        elif exc_type is not None:
            status = "failed"
        else:
            status = "completed"
        try:
            # Final report is synchronous to ensure delivery
            self._client.report_actual(
                intent_id=self.intent.intent_id,
                job_id=self._job_id,
                provider=self._intent_kwargs.get("provider", ""),
                api=self._intent_kwargs.get("api", ""),
                actual_calls=self._calls,
                actual_cost_usd=self._cost,
                actual_tokens=self._tokens,
                status=status,
                sync=True,
            )
            self._reported = True
        except Exception as e:
            _fail(f"final actual report failed for {self._job_id}", e, strict=self._client.strict)
        # Record actual cost to local cost history so future intents can
        # use observed pricing. Only record completed/failed jobs with
        # actual calls — killed jobs have unreliable cost data.
        if status in ("completed", "failed") and self._calls > 0 and self._client.cost_history:
            try:
                self._client.cost_history.record(
                    provider=self._intent_kwargs.get("provider", ""),
                    api=self._intent_kwargs.get("api", ""),
                    calls=self._calls,
                    cost_usd=self._cost,
                )
            except Exception as e:
                _fail(f"cost_history record failed for {self._job_id}", e, strict=self._client.strict)
