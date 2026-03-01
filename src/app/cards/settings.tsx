import React, { useState, useEffect } from "react";
import {
  Text,
  Flex,
  Box,
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

const API_BASE = "https://orchestrator-backend.netlify.app";

interface Actor {
  id: string;
  name: string;
  email: string;
  unipileAccountId: string;
  hubspotUserId: string | null;
  salesHubTier: string;
  createdAt: string;
}

hubspot.extend<"crm.record.tab">(({ context, actions }) => (
  <SettingsCard />
));

function SettingsCard() {
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

  useEffect(() => {
    loadActors();
    loadOnboardingStatus();
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
        const data = await res.json();
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

  if (loading) {
    return <LoadingSpinner label="Loading settings..." layout="centered" />;
  }

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
          <Input label="Email" name="email" value={newEmail} onInput={setNewEmail} placeholder="john@company.com" />
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
    </Flex>
  );
}
