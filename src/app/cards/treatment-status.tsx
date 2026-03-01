import React, { useState, useEffect } from "react";
import {
  Text,
  Flex,
  Divider,
  Alert,
  LoadingSpinner,
  Tag,
  Link,
  hubspot,
} from "@hubspot/ui-extensions";
import { useExtensionContext, useExtensionActions } from "@hubspot/ui-extensions";

const API_BASE = "https://gtmorchestrator.netlify.app";

const ORCH_PROPERTIES = [
  "orch_treatment_status",
  "orch_treatment_protocol",
  "orch_linkedin_status",
  "orch_enrichment_status",
  "orch_last_processed",
  "orch_actor_id",
  "firstname",
  "lastname",
  "company",
  "hs_linkedin_url",
];

type StatusVariant = "success" | "danger" | "warning" | "default" | "info";

function statusVariant(status: string): StatusVariant {
  if (!status) return "default";
  if (status === "completed" || status === "connected" || status === "sequence_enrolled") return "success";
  if (status === "failed") return "danger";
  if (status === "in_progress" || status === "invite_sent" || status === "pending") return "warning";
  return "default";
}

function statusLabel(status: string): string {
  if (!status) return "Not started";
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

hubspot.extend<"crm.record.sidebar">(({ context, actions }) => (
  <TreatmentStatusCard />
));

function TreatmentStatusCard() {
  const context = useExtensionContext<"crm.record.sidebar">();
  const actions = useExtensionActions<"crm.record.sidebar">();

  const [properties, setProperties] = useState<Record<string, string> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    actions
      .fetchCrmObjectProperties(ORCH_PROPERTIES)
      .then((props) => {
        setProperties(props);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load contact properties.");
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <LoadingSpinner label="Loading treatment status..." />;
  }

  if (error) {
    return (
      <Alert title="Error" variant="danger">
        {error}
      </Alert>
    );
  }

  if (!properties) {
    return <Text variant="microcopy">No data available.</Text>;
  }

  const contactName = [properties.firstname, properties.lastname].filter(Boolean).join(" ") || "Contact";
  const treatmentStatus = properties.orch_treatment_status;
  const linkedinStatus = properties.orch_linkedin_status;
  const enrichmentStatus = properties.orch_enrichment_status;
  const lastProcessed = properties.orch_last_processed;
  const actorId = properties.orch_actor_id;
  const linkedinUrl = properties.hs_linkedin_url;

  const hasAnyData = treatmentStatus || linkedinStatus || enrichmentStatus || lastProcessed;

  if (!hasAnyData) {
    return (
      <Flex direction="column" gap="sm">
        <Text format={{ fontWeight: "bold" }}>Treatment Status</Text>
        <Text variant="microcopy">
          No treatment data for {contactName}. This contact has not been processed by any treatment protocol.
        </Text>
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="sm">
      <Text format={{ fontWeight: "bold" }}>Treatment Status</Text>

      {/* Treatment progress */}
      <Flex direction="row" justify="between" align="center">
        <Text variant="microcopy">Treatment</Text>
        <Tag variant={statusVariant(treatmentStatus)}>
          {statusLabel(treatmentStatus)}
        </Tag>
      </Flex>

      {properties.orch_treatment_protocol && (
        <Flex direction="row" justify="between" align="center">
          <Text variant="microcopy">Protocol</Text>
          <Text variant="microcopy">{properties.orch_treatment_protocol}</Text>
        </Flex>
      )}

      <Divider />

      {/* LinkedIn status */}
      <Flex direction="row" justify="between" align="center">
        <Text variant="microcopy">LinkedIn</Text>
        <Tag variant={statusVariant(linkedinStatus)}>
          {statusLabel(linkedinStatus)}
        </Tag>
      </Flex>

      {linkedinUrl && (
        <Link href={linkedinUrl}>
          View LinkedIn Profile
        </Link>
      )}

      <Divider />

      {/* Enrichment status */}
      <Flex direction="row" justify="between" align="center">
        <Text variant="microcopy">Enrichment</Text>
        <Tag variant={statusVariant(enrichmentStatus)}>
          {statusLabel(enrichmentStatus)}
        </Tag>
      </Flex>

      {/* Actor info */}
      {actorId && (
        <>
          <Divider />
          <Flex direction="row" justify="between" align="center">
            <Text variant="microcopy">Actor</Text>
            <Text variant="microcopy">{actorId.slice(0, 8)}...</Text>
          </Flex>
        </>
      )}

      {/* Last processed */}
      {lastProcessed && (
        <>
          <Divider />
          <Text variant="microcopy">Last processed: {lastProcessed}</Text>
        </>
      )}
    </Flex>
  );
}
