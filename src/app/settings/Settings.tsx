import React, { useState, useEffect } from "react";
import {
  Text,
  Flex,
  Divider,
  Alert,
  Button,
  LoadingButton,
  LoadingSpinner,
  Input,
  Select,
  Tag,
  Heading,
  hubspot,
} from "@hubspot/ui-extensions";

const API_BASE = "https://gtmorchestrator.netlify.app";

const VALID_STEP_TYPES = [
  "enrich",
  "linkedin_search",
  "check_connection",
  "send_connection_request",
  "send_message",
  "enroll_sequence",
  "generate_copy",
];

const STEP_LABELS: Record<string, string> = {
  enrich: "Enrich",
  linkedin_search: "LinkedIn Search",
  check_connection: "Check Connection",
  send_connection_request: "Send Connection Request",
  send_message: "Send Message",
  enroll_sequence: "Enroll in Sequence",
  generate_copy: "Generate Copy",
};

interface Actor {
  id: string;
  name: string;
  email: string;
  unipileAccountId: string;
  hubspotUserId: string | null;
  salesHubTier: string;
  createdAt: string;
}

interface Protocol {
  id: string;
  name: string;
  actorId: string;
  steps: { type: string; params?: any }[];
  cadenceDays: number;
  listId: string | null;
  status: string;
  createdAt: string;
}

hubspot.extend<"settings">(({ actions }) => <SettingsPage />);

function SettingsPage() {
  const [actors, setActors] = useState<Actor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [setupRunning, setSetupRunning] = useState(false);
  const [alert, setAlert] = useState<{ type: "success" | "danger"; message: string } | null>(null);

  // New actor form
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newUnipileId, setNewUnipileId] = useState("");
  const [newTier, setNewTier] = useState("professional");
  const [showForm, setShowForm] = useState(false);

  // Onboarding status
  const [onboardingStatus, setOnboardingStatus] = useState<any>(null);

  // Protocol state
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [templates, setTemplates] = useState<Record<string, any>>({});
  const [showProtocolForm, setShowProtocolForm] = useState(false);
  const [editingProtocolId, setEditingProtocolId] = useState<string | null>(null);
  const [protocolSaving, setProtocolSaving] = useState(false);

  // Protocol form fields
  const [protoName, setProtoName] = useState("");
  const [protoActorId, setProtoActorId] = useState("");
  const [protoTemplateId, setProtoTemplateId] = useState("custom");
  const [protoListId, setProtoListId] = useState("");
  const [protoCadenceDays, setProtoCadenceDays] = useState("1");
  const [protoSteps, setProtoSteps] = useState<string[]>([]);
  const [addStepType, setAddStepType] = useState(VALID_STEP_TYPES[0]);

  useEffect(() => {
    loadActors();
    loadOnboardingStatus();
    loadProtocols();
    loadTemplates();
  }, []);

  async function loadActors() {
    try {
      const res = await hubspot.fetch(`${API_BASE}/api/actors`, { method: "GET" });
      if (res.ok) {
        const data = await res.json();
        setActors(data.actors || []);
      }
    } catch (err) {
      setAlert({ type: "danger", message: "Failed to load actors" });
    } finally {
      setLoading(false);
    }
  }

  async function loadOnboardingStatus() {
    try {
      const res = await hubspot.fetch(`${API_BASE}/api/onboarding/status`, { method: "GET" });
      if (res.ok) {
        const data = await res.json();
        setOnboardingStatus(data);
      }
    } catch {
      // Non-critical
    }
  }

  async function loadProtocols() {
    try {
      const res = await hubspot.fetch(`${API_BASE}/api/treatments`, { method: "GET" });
      if (res.ok) {
        const data = await res.json();
        setProtocols(data.protocols || []);
      }
    } catch {
      // Non-critical on initial load
    }
  }

  async function loadTemplates() {
    try {
      const res = await hubspot.fetch(`${API_BASE}/api/treatments/templates`, { method: "GET" });
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates || {});
      }
    } catch {
      // Non-critical
    }
  }

  async function handleAddActor() {
    if (!newName.trim() || !newEmail.trim() || !newUnipileId.trim()) {
      setAlert({ type: "danger", message: "All fields are required" });
      return;
    }

    setSaving(true);
    setAlert(null);

    try {
      const res = await hubspot.fetch(`${API_BASE}/api/actors`, {
        method: "POST",
        body: {
          name: newName,
          email: newEmail,
          unipileAccountId: newUnipileId,
          salesHubTier: newTier,
        },
      });

      if (res.ok) {
        const actor = await res.json();
        setActors((prev) => [...prev, actor]);
        setNewName("");
        setNewEmail("");
        setNewUnipileId("");
        setShowForm(false);
        setAlert({ type: "success", message: `Actor "${actor.name}" added` });
      } else {
        const err = await res.json();
        setAlert({ type: "danger", message: err.error || "Failed to add actor" });
      }
    } catch {
      setAlert({ type: "danger", message: "Network error" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteActor(id: string, name: string) {
    try {
      const res = await hubspot.fetch(`${API_BASE}/api/actors/${id}`, { method: "DELETE" });
      if (res.ok) {
        setActors((prev) => prev.filter((a) => a.id !== id));
        setAlert({ type: "success", message: `Actor "${name}" removed` });
      }
    } catch {
      setAlert({ type: "danger", message: "Failed to remove actor" });
    }
  }

  async function handleSetupProperties() {
    setSetupRunning(true);
    setAlert(null);

    try {
      const res = await hubspot.fetch(`${API_BASE}/api/onboarding/setup-all`, { method: "POST" });
      if (res.ok) {
        setAlert({ type: "success", message: "Properties and integrations configured" });
        await loadOnboardingStatus();
      } else {
        setAlert({ type: "danger", message: "Setup failed" });
      }
    } catch {
      setAlert({ type: "danger", message: "Network error during setup" });
    } finally {
      setSetupRunning(false);
    }
  }

  function resetProtocolForm() {
    setProtoName("");
    setProtoActorId("");
    setProtoTemplateId("custom");
    setProtoListId("");
    setProtoCadenceDays("1");
    setProtoSteps([]);
    setEditingProtocolId(null);
  }

  function handleTemplateChange(templateId: string) {
    setProtoTemplateId(templateId);
    if (templateId !== "custom" && templates[templateId]) {
      const tmpl = templates[templateId];
      setProtoSteps(tmpl.steps.map((s: any) => s.type));
      if (tmpl.cadenceDays) setProtoCadenceDays(String(tmpl.cadenceDays));
    }
  }

  function handleEditProtocol(protocol: Protocol) {
    setEditingProtocolId(protocol.id);
    setProtoName(protocol.name);
    setProtoActorId(protocol.actorId);
    setProtoTemplateId("custom");
    setProtoListId(protocol.listId || "");
    setProtoCadenceDays(String(protocol.cadenceDays || 1));
    setProtoSteps(protocol.steps.map((s) => s.type));
    setShowProtocolForm(true);
  }

  async function handleSaveProtocol() {
    if (!protoName.trim() || !protoActorId) {
      setAlert({ type: "danger", message: "Protocol name and actor are required" });
      return;
    }
    if (protoSteps.length === 0) {
      setAlert({ type: "danger", message: "At least one step is required" });
      return;
    }

    setProtocolSaving(true);
    setAlert(null);

    const steps = protoSteps.map((type) => ({ type, params: {} }));
    const body: any = {
      name: protoName,
      actorId: protoActorId,
      steps,
      cadenceDays: Number(protoCadenceDays) || 1,
      listId: protoListId || null,
    };

    if (!editingProtocolId && protoTemplateId !== "custom") {
      body.templateId = protoTemplateId;
    }

    try {
      const url = editingProtocolId
        ? `${API_BASE}/api/treatments/${editingProtocolId}`
        : `${API_BASE}/api/treatments/create`;
      const method = editingProtocolId ? "PUT" : "POST";

      const res = await hubspot.fetch(url, { method, body });

      if (res.ok) {
        setAlert({
          type: "success",
          message: editingProtocolId ? "Protocol updated" : "Protocol created",
        });
        resetProtocolForm();
        setShowProtocolForm(false);
        await loadProtocols();
      } else {
        const err = await res.json();
        setAlert({ type: "danger", message: err.error || "Failed to save protocol" });
      }
    } catch {
      setAlert({ type: "danger", message: "Network error" });
    } finally {
      setProtocolSaving(false);
    }
  }

  async function handleDeleteProtocol(id: string, name: string) {
    try {
      const res = await hubspot.fetch(`${API_BASE}/api/treatments/${id}`, { method: "DELETE" });
      if (res.ok) {
        setProtocols((prev) => prev.filter((p) => p.id !== id));
        setAlert({ type: "success", message: `Protocol "${name}" deleted` });
      }
    } catch {
      setAlert({ type: "danger", message: "Failed to delete protocol" });
    }
  }

  if (loading) {
    return <LoadingSpinner label="Loading settings..." layout="centered" />;
  }

  const templateOptions = [
    { value: "custom", label: "Custom" },
    ...Object.entries(templates).map(([id, tmpl]: [string, any]) => ({
      value: id,
      label: tmpl.name,
    })),
  ];

  const actorOptions = actors.map((a) => ({ value: a.id, label: a.name }));

  const stepTypeOptions = VALID_STEP_TYPES.map((t) => ({
    value: t,
    label: STEP_LABELS[t] || t,
  }));

  return (
    <Flex direction="column" gap="md">
      <Heading>Orchestrator Settings</Heading>

      {/* Onboarding status */}
      {onboardingStatus && (
        <>
          <Text format={{ fontWeight: "bold" }}>Integration Status</Text>
          <Flex direction="row" gap="sm" wrap="wrap">
            <Tag variant={onboardingStatus.status?.hubspot?.configured ? "success" : "danger"}>
              HubSpot {onboardingStatus.status?.hubspot?.configured ? "OK" : "Missing"}
            </Tag>
            <Tag variant={onboardingStatus.status?.unipile?.configured ? "success" : "danger"}>
              Unipile {onboardingStatus.status?.unipile?.configured ? "OK" : "Missing"}
            </Tag>
            <Tag variant={onboardingStatus.status?.sumble?.configured ? "success" : "danger"}>
              Sumble {onboardingStatus.status?.sumble?.configured ? "OK" : "Missing"}
            </Tag>
          </Flex>
          {!onboardingStatus.ready && (
            <Text variant="microcopy">Next: {onboardingStatus.nextStep}</Text>
          )}
          <LoadingButton
            onClick={handleSetupProperties}
            loading={setupRunning}
            variant="secondary"
            size="sm"
          >
            Run Setup
          </LoadingButton>
          <Divider />
        </>
      )}

      {/* Alert */}
      {alert && (
        <Alert title={alert.type === "success" ? "Done" : "Error"} variant={alert.type}>
          {alert.message}
        </Alert>
      )}

      {/* Actors list */}
      <Flex direction="row" justify="between" align="center">
        <Text format={{ fontWeight: "bold" }}>Actors ({actors.length})</Text>
        <Button variant="primary" size="xs" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "Add Actor"}
        </Button>
      </Flex>

      {/* Add actor form */}
      {showForm && (
        <Flex direction="column" gap="sm">
          <Input label="Name" name="name" value={newName} onInput={setNewName} placeholder="John Doe" />
          <Input
            label="Email (must match HubSpot owner email)"
            name="email"
            value={newEmail}
            onInput={setNewEmail}
            placeholder="john@company.com"
          />
          <Input
            label="Unipile Account ID"
            name="unipileId"
            value={newUnipileId}
            onInput={setNewUnipileId}
            placeholder="acc_..."
          />
          <Select
            label="Sales Hub Tier"
            name="tier"
            value={newTier}
            onChange={setNewTier}
            options={[
              { value: "professional", label: "Professional" },
              { value: "enterprise", label: "Enterprise" },
            ]}
          />
          <LoadingButton onClick={handleAddActor} loading={saving} variant="primary" size="sm">
            Save Actor
          </LoadingButton>
          <Divider />
        </Flex>
      )}

      {/* Actor cards */}
      {actors.length === 0 && !showForm && (
        <Text variant="microcopy">No actors configured. Add an actor to get started.</Text>
      )}

      {actors.map((actor) => (
        <Flex key={actor.id} direction="column" gap="xs">
          <Flex direction="row" justify="between" align="center">
            <Flex direction="column" gap="flush">
              <Text format={{ fontWeight: "demibold" }}>{actor.name}</Text>
              <Text variant="microcopy">{actor.email}</Text>
            </Flex>
            <Flex direction="row" gap="xs" align="center">
              <Tag variant={actor.salesHubTier === "enterprise" ? "success" : "default"}>
                {actor.salesHubTier}
              </Tag>
              <Button
                variant="destructive"
                size="xs"
                onClick={() => handleDeleteActor(actor.id, actor.name)}
              >
                Remove
              </Button>
            </Flex>
          </Flex>
          <Text variant="microcopy">Unipile: {actor.unipileAccountId}</Text>
          <Divider />
        </Flex>
      ))}

      {/* Treatment Protocols */}
      <Divider />
      <Flex direction="row" justify="between" align="center">
        <Text format={{ fontWeight: "bold" }}>Treatment Protocols ({protocols.length})</Text>
        <Button
          variant="primary"
          size="xs"
          onClick={() => {
            if (showProtocolForm) {
              resetProtocolForm();
              setShowProtocolForm(false);
            } else {
              setShowProtocolForm(true);
            }
          }}
        >
          {showProtocolForm ? "Cancel" : "New Protocol"}
        </Button>
      </Flex>

      {/* Protocol form */}
      {showProtocolForm && (
        <Flex direction="column" gap="sm">
          <Input
            label="Protocol Name"
            name="protoName"
            value={protoName}
            onInput={setProtoName}
            placeholder="e.g. LinkedIn Outreach Q1"
          />
          {actorOptions.length > 0 && (
            <Select
              label="Actor"
              name="protoActor"
              value={protoActorId}
              onChange={setProtoActorId}
              options={actorOptions}
            />
          )}
          {actorOptions.length === 0 && (
            <Text variant="microcopy">Add an actor above first.</Text>
          )}
          <Select
            label="Template"
            name="protoTemplate"
            value={protoTemplateId}
            onChange={handleTemplateChange}
            options={templateOptions}
          />
          <Input
            label="Days between messaging steps"
            name="protoCadence"
            value={protoCadenceDays}
            onInput={setProtoCadenceDays}
            placeholder="1"
          />
          <Input
            label="HubSpot List ID (optional)"
            name="protoListId"
            value={protoListId}
            onInput={setProtoListId}
            placeholder="List ID"
          />

          {/* Steps */}
          <Text format={{ fontWeight: "demibold" }}>Steps ({protoSteps.length})</Text>
          <Flex direction="row" gap="xs" wrap="wrap">
            {protoSteps.map((stepType, idx) => (
              <Tag key={`${stepType}-${idx}`} variant="default">
                {idx + 1}. {STEP_LABELS[stepType] || stepType}
              </Tag>
            ))}
          </Flex>
          {protoSteps.length > 0 && (
            <Button
              variant="secondary"
              size="xs"
              onClick={() => setProtoSteps((prev) => prev.slice(0, -1))}
            >
              Remove Last Step
            </Button>
          )}

          <Flex direction="row" gap="xs" align="end">
            <Select
              label="Add Step"
              name="addStep"
              value={addStepType}
              onChange={setAddStepType}
              options={stepTypeOptions}
            />
            <Button
              variant="secondary"
              size="xs"
              onClick={() => setProtoSteps((prev) => [...prev, addStepType])}
            >
              Add
            </Button>
          </Flex>

          <LoadingButton
            onClick={handleSaveProtocol}
            loading={protocolSaving}
            variant="primary"
            size="sm"
          >
            {editingProtocolId ? "Update Protocol" : "Save Protocol"}
          </LoadingButton>
          <Divider />
        </Flex>
      )}

      {/* Protocol cards */}
      {protocols.length === 0 && !showProtocolForm && (
        <Text variant="microcopy">No protocols defined. Create one to start automating.</Text>
      )}

      {protocols.map((proto) => {
        const actorName = actors.find((a) => a.id === proto.actorId)?.name || proto.actorId.slice(0, 8);
        return (
          <Flex key={proto.id} direction="column" gap="xs">
            <Flex direction="row" justify="between" align="center">
              <Text format={{ fontWeight: "demibold" }}>{proto.name}</Text>
              <Tag variant={proto.status === "active" ? "success" : "default"}>
                {proto.status}
              </Tag>
            </Flex>
            <Text variant="microcopy">
              Actor: {actorName} | Cadence: {proto.cadenceDays || 1}d | Steps: {proto.steps.length}
              {proto.listId ? ` | List: ${proto.listId}` : ""}
            </Text>
            <Flex direction="row" gap="xs" wrap="wrap">
              {proto.steps.map((s, idx) => (
                <Tag key={`${s.type}-${idx}`} variant="default">
                  {STEP_LABELS[s.type] || s.type}
                </Tag>
              ))}
            </Flex>
            <Flex direction="row" gap="xs">
              <Button variant="secondary" size="xs" onClick={() => handleEditProtocol(proto)}>
                Edit
              </Button>
              <Button
                variant="destructive"
                size="xs"
                onClick={() => handleDeleteProtocol(proto.id, proto.name)}
              >
                Delete
              </Button>
            </Flex>
            <Divider />
          </Flex>
        );
      })}
    </Flex>
  );
}
