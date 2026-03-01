import React, { useState, useEffect, useCallback } from "react";
import {
  Text,
  Flex,
  Divider,
  Alert,
  Button,
  LoadingButton,
  LoadingSpinner,
  Select,
  Tag,
  Heading,
  ProgressBar,
  hubspot,
} from "@hubspot/ui-extensions";

const API_BASE = "https://gtmorchestrator.netlify.app";

const STEP_LABELS: Record<string, string> = {
  enrich: "Enrich",
  linkedin_search: "LinkedIn Search",
  check_connection: "Check Connection",
  send_connection_request: "Connect",
  send_message: "Message",
  enroll_sequence: "Sequence",
  generate_copy: "Gen Copy",
};

interface Protocol {
  id: string;
  name: string;
  steps: { type: string }[];
  cadenceDays: number;
}

interface TreatmentRun {
  id: string;
  treatmentId: string;
  protocol: { name: string; steps: any[] };
  actorId: string;
  status: string;
  totalItems: number;
  percentComplete: number;
  progress: {
    pending: number;
    in_progress: number;
    completed: number;
    failed: number;
    skipped: number;
  };
  createdAt: string;
}

interface ActorUsage {
  [actionType: string]: {
    daily: { used: number; limit: number | string };
    hourly: { used: number; limit: number | string };
    lastAction: string | null;
  };
}

hubspot.extend<"crm.record.tab">(({ context, actions }) => (
  <DashboardCard context={context} />
));

function DashboardCard({ context }: { context: any }) {
  const [treatments, setTreatments] = useState<TreatmentRun[]>([]);
  const [rateLimits, setRateLimits] = useState<Record<string, ActorUsage>>({});
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Initiate treatment state
  const [selectedProtocolId, setSelectedProtocolId] = useState("");
  const [initiating, setInitiating] = useState(false);
  const [initiateAlert, setInitiateAlert] = useState<{ type: "success" | "danger"; message: string } | null>(null);

  const objectId = context?.crm?.objectId;

  const loadData = useCallback(async () => {
    try {
      const [queueRes, limitsRes, protocolsRes] = await Promise.all([
        hubspot.fetch(`${API_BASE}/api/queue/all`, { method: "GET" }),
        hubspot.fetch(`${API_BASE}/api/queue/rate-limits/all`, { method: "GET" }),
        hubspot.fetch(`${API_BASE}/api/treatments`, { method: "GET" }),
      ]);

      if (queueRes.ok) {
        const queueData = await queueRes.json();
        setTreatments(queueData.treatments || []);
      }

      if (limitsRes.ok) {
        const limitsData = await limitsRes.json();
        setRateLimits(limitsData.usage || {});
      }

      if (protocolsRes.ok) {
        const protoData = await protocolsRes.json();
        setProtocols(protoData.protocols || []);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  async function handlePause(runId: string) {
    await hubspot.fetch(`${API_BASE}/api/treatments/${runId}/pause`, { method: "POST" });
    await loadData();
  }

  async function handleResume(runId: string) {
    await hubspot.fetch(`${API_BASE}/api/treatments/${runId}/resume`, { method: "POST" });
    await loadData();
  }

  async function handleInitiateTreatment() {
    if (!selectedProtocolId || !objectId) return;

    setInitiating(true);
    setInitiateAlert(null);

    try {
      const res = await hubspot.fetch(`${API_BASE}/api/treatments/initiate`, {
        method: "POST",
        body: {
          protocolId: selectedProtocolId,
          contactIds: [objectId],
        },
      });

      if (res.ok) {
        const data = await res.json();
        setInitiateAlert({
          type: "success",
          message: `Treatment started (Run: ${data.runId.slice(0, 8)}...)`,
        });
        setSelectedProtocolId("");
        await loadData();
      } else {
        const err = await res.json();
        setInitiateAlert({ type: "danger", message: err.error || "Failed to start treatment" });
      }
    } catch {
      setInitiateAlert({ type: "danger", message: "Network error" });
    } finally {
      setInitiating(false);
    }
  }

  if (loading) {
    return <LoadingSpinner label="Loading dashboard..." layout="centered" />;
  }

  const activeTreatments = treatments.filter((t) => t.status === "in_progress" || t.status === "paused");
  const completedTreatments = treatments.filter((t) => t.status !== "in_progress" && t.status !== "paused");

  const selectedProtocol = protocols.find((p) => p.id === selectedProtocolId);
  const protocolOptions = protocols.map((p) => ({
    value: p.id,
    label: `${p.name} (${p.steps.length} steps, ${p.cadenceDays || 1}d cadence)`,
  }));

  return (
    <Flex direction="column" gap="md">
      <Flex direction="row" justify="between" align="center">
        <Heading>Orchestrator Dashboard</Heading>
        <Button variant="secondary" size="xs" onClick={loadData}>
          Refresh
        </Button>
      </Flex>

      {error && (
        <Alert title="Error" variant="danger">
          {error}
        </Alert>
      )}

      {/* Start Treatment for This Contact */}
      {objectId && (
        <>
          <Text format={{ fontWeight: "bold" }}>Start Treatment for This Contact</Text>

          {initiateAlert && (
            <Alert
              title={initiateAlert.type === "success" ? "Done" : "Error"}
              variant={initiateAlert.type}
            >
              {initiateAlert.message}
            </Alert>
          )}

          {protocolOptions.length === 0 ? (
            <Text variant="microcopy">No protocols available. Create one in Settings.</Text>
          ) : (
            <Flex direction="column" gap="sm">
              <Select
                label="Protocol"
                name="protocolPicker"
                value={selectedProtocolId}
                onChange={setSelectedProtocolId}
                options={protocolOptions}
              />
              {selectedProtocol && (
                <Flex direction="row" gap="xs" wrap="wrap">
                  {selectedProtocol.steps.map((s, idx) => (
                    <Tag key={`${s.type}-${idx}`} variant="default">
                      {STEP_LABELS[s.type] || s.type}
                    </Tag>
                  ))}
                </Flex>
              )}
              <LoadingButton
                onClick={handleInitiateTreatment}
                loading={initiating}
                variant="primary"
                size="sm"
                disabled={!selectedProtocolId}
              >
                Start Treatment
              </LoadingButton>
            </Flex>
          )}
          <Divider />
        </>
      )}

      {/* Active treatments */}
      <Text format={{ fontWeight: "bold" }}>Active Treatments ({activeTreatments.length})</Text>

      {activeTreatments.length === 0 && (
        <Text variant="microcopy">No active treatments. Create a treatment protocol to get started.</Text>
      )}

      {activeTreatments.map((t) => (
        <Flex key={t.id} direction="column" gap="xs">
          <Flex direction="row" justify="between" align="center">
            <Text format={{ fontWeight: "demibold" }}>
              {t.protocol?.name || t.treatmentId}
            </Text>
            <Tag variant={t.status === "paused" ? "warning" : "success"}>
              {t.status}
            </Tag>
          </Flex>

          <ProgressBar
            value={t.percentComplete}
            variant={t.progress?.failed > 0 ? "danger" : "success"}
          />

          <Flex direction="row" gap="sm" wrap="wrap">
            <Text variant="microcopy">
              Pending: {t.progress?.pending || 0}
            </Text>
            <Text variant="microcopy">
              Done: {t.progress?.completed || 0}
            </Text>
            <Text variant="microcopy">
              Failed: {t.progress?.failed || 0}
            </Text>
            <Text variant="microcopy">
              Total: {t.totalItems || 0}
            </Text>
          </Flex>

          <Flex direction="row" gap="xs">
            {t.status === "in_progress" && (
              <Button variant="secondary" size="xs" onClick={() => handlePause(t.id)}>
                Pause
              </Button>
            )}
            {t.status === "paused" && (
              <Button variant="primary" size="xs" onClick={() => handleResume(t.id)}>
                Resume
              </Button>
            )}
          </Flex>
          <Divider />
        </Flex>
      ))}

      {/* Rate limits */}
      <Divider />
      <Text format={{ fontWeight: "bold" }}>Rate Limit Usage</Text>

      {Object.keys(rateLimits).length === 0 && (
        <Text variant="microcopy">No rate limit data yet.</Text>
      )}

      {Object.entries(rateLimits).map(([actorId, usage]) => (
        <Flex key={actorId} direction="column" gap="xs">
          <Text format={{ fontWeight: "demibold" }}>Actor: {actorId.slice(0, 8)}...</Text>
          {Object.entries(usage).map(([actionType, limits]) => {
            const dailyPct =
              typeof limits.daily.limit === "number"
                ? Math.round((limits.daily.used / limits.daily.limit) * 100)
                : 0;
            return (
              <Flex key={actionType} direction="row" justify="between" align="center">
                <Text variant="microcopy">{actionType.replace(/_/g, " ")}</Text>
                <Flex direction="row" gap="xs" align="center">
                  <Text variant="microcopy">
                    {limits.daily.used}/{limits.daily.limit}
                  </Text>
                  <Tag variant={dailyPct > 80 ? "danger" : dailyPct > 50 ? "warning" : "success"}>
                    {dailyPct}%
                  </Tag>
                </Flex>
              </Flex>
            );
          })}
          <Divider />
        </Flex>
      ))}

      {/* Completed treatments summary */}
      {completedTreatments.length > 0 && (
        <>
          <Text format={{ fontWeight: "bold" }}>
            Completed ({completedTreatments.length})
          </Text>
          {completedTreatments.slice(0, 5).map((t) => (
            <Flex key={t.id} direction="row" justify="between" align="center">
              <Text variant="microcopy">{t.protocol?.name || t.treatmentId}</Text>
              <Text variant="microcopy">
                {t.progress?.completed || 0}/{t.totalItems || 0} processed
              </Text>
            </Flex>
          ))}
        </>
      )}
    </Flex>
  );
}
