# Positional receipts from observe-replay.sql, in the documented phase order.
def require($condition; $message):
  if $condition then . else error($message) end;
def same_turn($other):
  .databaseOid == $other.databaseOid and .turn == $other.turn
  and .sequence == $other.sequence and .fingerprint == $other.fingerprint;
# Producer replay policy 1 mints each claim from the DB clock plus 30 seconds.
def claimed_at_ms:
  .leaseUntilMs - 30000;
def replay_state:
  {generation, attempts, leaseUntilMs, checkpoint, status, decoded};
def pending:
  .accepted and .status == "pending" and (.decoded | not)
  and .checkpoint == (.sequence - 1);
def completed:
  .accepted and .status == "completed" and .decoded and .checkpoint == .sequence;

require(length == 7 and all(.[]; type == "object"); "Seven ordered installed samples required")
| . as [$accepted, $ingestStopped, $claimed, $replayStopped, $completed, $foreignBefore, $foreignAfter]
| require(
    ($executionSha | test("^[a-f0-9]{64}$"))
    and $accepted.fingerprint == $executionSha
    and all([$ingestStopped, $claimed, $replayStopped, $completed][]; same_turn($accepted))
    and ($accepted | pending and .policyOne and (.paused | not))
    and $accepted.generation > 0
    and $accepted.attempts == 1
    and $accepted.leaseUntilMs > $accepted.sampledAtMs
    and ($ingestStopped | pending)
    and $ingestStopped.generation == $accepted.generation
    and $ingestStopped.attempts == $accepted.attempts
    and $ingestStopped.leaseUntilMs == $accepted.leaseUntilMs
    and $accepted.sampledAtMs <= $ingestStopped.sampledAtMs;
    "The accepted turn did not persist unchanged across ingestion interruption")
| require(
    ($claimed | claimed_at_ms) >= $ingestStopped.leaseUntilMs
    and $claimed.sampledAtMs >= ($claimed | claimed_at_ms);
    "Replay claimed the accepted turn before its ingestion lease expiry")
| require(
    ($claimed | pending)
    and $claimed.generation == ($ingestStopped.generation + 1)
    and $claimed.attempts == ($ingestStopped.attempts + 1)
    and $claimed.leaseUntilMs > $claimed.sampledAtMs
    and $claimed.sampledAtMs >= $ingestStopped.sampledAtMs
    and ($replayStopped | pending)
    and ($replayStopped | replay_state) == ($claimed | replay_state)
    and $replayStopped.sampledAtMs >= $claimed.sampledAtMs;
    "A replay attempt and its durable lease did not survive interruption")
| require(
    ($completed | completed)
    and $completed.generation == ($replayStopped.generation + 1)
    and $completed.attempts == ($replayStopped.attempts + 1)
    and ($completed | claimed_at_ms) >= $replayStopped.leaseUntilMs
    and $completed.sampledAtMs >= ($completed | claimed_at_ms)
    and $completed.sampledAtMs >= $replayStopped.sampledAtMs;
    "Replay did not advance the exact checkpoint after lease expiry")
| require(
    $foreignBefore.databaseOid == $accepted.databaseOid
    and $foreignBefore.turn != $accepted.turn
    and ($foreignBefore.fingerprint | test("^[a-f0-9]{64}$"))
    and $foreignBefore.fingerprint != $executionSha
    and ($foreignBefore | pending and .policyOne and (.paused | not) and .attempts < 3)
    and ($foreignBefore.leaseUntilMs == null or $foreignBefore.leaseUntilMs <= $foreignBefore.sampledAtMs)
    and $foreignBefore.sampledAtMs <= $claimed.sampledAtMs
    and $foreignAfter.sampledAtMs >= $completed.sampledAtMs
    and ($foreignAfter | same_turn($foreignBefore))
    and ($foreignAfter | pending and .policyOne and (.paused | not))
    and ($foreignAfter | replay_state) == ($foreignBefore | replay_state);
    "An eligible incompatible replay turn was not proven untouched")
| {format: "fleetiq-minimal-demo-replay.v1", databaseOid: $completed.databaseOid,
    fingerprint: $executionSha, acceptedTurn: $completed.turn,
    incompatibleTurn: $foreignAfter.turn,
    ingestGeneration: $accepted.generation, interruptedReplayGeneration: $claimed.generation,
    completedGeneration: $completed.generation, completedCheckpoint: $completed.checkpoint,
    outcome: "passed"}
