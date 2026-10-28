import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Divider,
  FileInput,
  Group,
  List,
  Modal,
  Paper,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconDownload,
  IconHistory,
  IconRestore,
  IconShieldCheck,
  IconUpload,
} from "@tabler/icons-react";
import {
  MAX_BACKUP_BYTES,
  type RecoveryPoint,
  type RestorePreview,
  type RestoreResult,
} from "../shared/backup";
import { api, apiUrl } from "./api";
const formatBackupDate = (date: string) =>
  new Intl.DateTimeFormat("it-IT", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Rome",
  }).format(new Date(date));

const summaries = [
  ["operations", "Operazioni"],
  ["transactions", "Transazioni"],
  ["documents", "Schede documento"],
  ["document_versions", "File e versioni"],
  ["tasks", "Attività"],
  ["people", "Contatti"],
  ["movements", "Movimenti finanziari"],
] as const;

export function BackupRestore({
  onRestored,
}: {
  onRestored: () => Promise<void>;
}) {
  const [opened, setOpened] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState<"verify" | "restore" | "cancel" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [recoveryPoints, setRecoveryPoints] = useState<RecoveryPoint[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const loadHistory = useCallback(async () => {
    try {
      const data = await api<{ recoveryPoints: RecoveryPoint[] }>("restores");
      setRecoveryPoints(data.recoveryPoints);
      setHistoryError(null);
    } catch (e) {
      setHistoryError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (busy || preview) e.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [busy, preview]);
  async function verify() {
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) {
      setError("Il backup supera il limite di 512 MB");
      return;
    }
    setBusy("verify");
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      setPreview(
        await api<RestorePreview>("restores/preview", {
          method: "POST",
          body: form,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  async function close() {
    if (busy) return;
    setBusy("cancel");
    setError(null);
    try {
      if (preview) await api(`restores/${preview.id}`, { method: "DELETE" });
      setPreview(null);
      setFile(null);
      setConfirmation("");
      setOpened(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  async function restore() {
    if (!preview) return;
    setBusy("restore");
    setError(null);
    let activated = false;
    try {
      await api<RestoreResult>(`restores/${preview.id}/confirm`, {
        method: "POST",
        body: JSON.stringify({
          expectedState: preview.expectedState,
          confirmation,
        }),
      });
      activated = true;
      setPreview(null);
      setFile(null);
      setConfirmation("");
      setOpened(false);
      await onRestored();
      await loadHistory();
      notifications.show({
        title: "Dati ripristinati",
        message:
          "Il backup è ora attivo. La copia dei dati precedenti è disponibile nelle impostazioni.",
        color: "teal",
        autoClose: 8000,
      });
    } catch (e) {
      if (activated) {
        notifications.show({
          title: "Ripristino completato",
          message:
            "Ricarica la pagina per visualizzare i dati appena ripristinati.",
          color: "orange",
          autoClose: false,
        });
      } else setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <>
      <Paper withBorder p="lg">
        <Group gap="sm">
          <IconRestore size={22} />
          <Title order={3}>Backup e ripristino</Title>
        </Group>
        <Text c="dimmed" size="sm" mt="sm">
          Carica il backup completo di home manager per recuperare dati e
          documenti anche in una nuova installazione Home Assistant.
        </Text>
        <Group mt="lg">
          <Button
            component="a"
            href={apiUrl("backup")}
            variant="light"
            leftSection={<IconDownload size={16} />}
          >
            Scarica backup completo
          </Button>
          <Button
            leftSection={<IconUpload size={16} />}
            onClick={() => {
              setError(null);
              setOpened(true);
            }}
          >
            Carica backup
          </Button>
        </Group>
        <Divider my="lg" />
        <Group gap="sm" mb="sm">
          <IconHistory size={20} />
          <Text fw={600}>Copie precedenti al ripristino</Text>
        </Group>
        <Text size="sm" c="dimmed" mb="md">
          Dopo ogni ripristino conserviamo i dati che erano attivi. Puoi
          scaricarli e ricaricarli come un normale backup.
        </Text>
        {historyError && (
          <Alert color="red">
            {historyError}
            <Button variant="subtle" onClick={() => void loadHistory()}>
              Riprova
            </Button>
          </Alert>
        )}
        {!historyError && !recoveryPoints.length && (
          <Text c="dimmed" size="sm">
            Non è ancora stato eseguito alcun ripristino.
          </Text>
        )}
        <Stack gap="sm">
          {recoveryPoints.map((point) => (
            <Paper key={point.id} withBorder p="md">
              <Group justify="space-between">
                <div>
                  <Text fw={500} size="sm">
                    Copia conservata il {formatBackupDate(point.createdAt)}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {point.operations.join(" · ")} ·{" "}
                    {point.counts.document_versions ?? 0} file ·{" "}
                    {point.counts.tasks ?? 0} attività
                  </Text>
                </div>
                <Button
                  component="a"
                  href={apiUrl(`restores/recovery/${point.id}/backup`)}
                  size="xs"
                  variant="default"
                  leftSection={<IconDownload size={15} />}
                >
                  Scarica copia precedente
                </Button>
              </Group>
            </Paper>
          ))}
        </Stack>
      </Paper>
      <Modal
        opened={opened}
        onClose={() => void close()}
        closeOnClickOutside={!busy}
        closeOnEscape={!busy}
        withCloseButton={!busy}
        title={<Title order={3}>Ripristina un backup completo</Title>}
        size="lg"
        centered
      >
        <Stack>
          {error && (
            <Alert color="red" title="Operazione non completata">
              {error}
            </Alert>
          )}
          {!preview ? (
            <>
              <Alert color="blue" icon={<IconShieldCheck size={20} />}>
                La verifica del file non modifica i dati attuali. Potrai
                controllare il contenuto prima di confermare.
              </Alert>
              <FileInput
                label="Backup completo di home manager (.zip)"
                description="Massimo 512 MB. Seleziona il ZIP scaricato con “Backup completo”, senza estrarlo."
                placeholder="Seleziona il backup"
                accept=".zip,application/zip,application/x-zip-compressed"
                value={file}
                onChange={(value) => {
                  setFile(value);
                  setError(null);
                }}
                clearable
                disabled={!!busy}
              />
              <Group justify="flex-end">
                <Button
                  variant="default"
                  onClick={() => void close()}
                  disabled={!!busy}
                >
                  Annulla
                </Button>
                <Button
                  onClick={() => void verify()}
                  loading={busy === "verify"}
                  disabled={!file || !!busy}
                  leftSection={<IconShieldCheck size={17} />}
                >
                  Verifica backup
                </Button>
              </Group>
            </>
          ) : (
            <>
              <Alert
                color="orange"
                title="Il ripristino sostituisce tutti i dati attivi"
              >
                Verranno ripristinate tutte le operazioni presenti nel backup.
                Le modifiche successive alla sua creazione non verranno unite
                automaticamente. I dati attuali saranno conservati in una copia
                precedente.
              </Alert>
              <div>
                <Text size="sm" fw={600}>
                  {preview.filename}
                </Text>
                <Text size="sm" c="dimmed">
                  Backup del{" "}
                  {preview.backupDate
                    ? formatBackupDate(preview.backupDate)
                    : "giorno non indicato"}{" "}
                  · {preview.operations.join(" · ")}
                </Text>
              </div>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Contenuto</Table.Th>
                    <Table.Th ta="right">Dati attuali</Table.Th>
                    <Table.Th ta="right">Nel backup</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {summaries.map(([key, label]) => (
                    <Table.Tr key={key}>
                      <Table.Td>{label}</Table.Td>
                      <Table.Td ta="right">
                        {preview.currentCounts[key] ?? 0}
                      </Table.Td>
                      <Table.Td ta="right">{preview.counts[key] ?? 0}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
              <List size="sm" spacing="xs">
                <List.Item>
                  Il database e i file hanno superato i controlli di integrità.
                </List.Item>
                <List.Item>
                  Le impostazioni dell’add-on e l’accesso Home Assistant vengono
                  mantenuti.
                </List.Item>
                <List.Item>
                  Le altre finestre aperte dovranno essere ricaricate.
                </List.Item>
              </List>
              <TextInput
                label="Digita RIPRISTINA per confermare"
                value={confirmation}
                onChange={(e) => setConfirmation(e.currentTarget.value)}
                disabled={!!busy}
                autoComplete="off"
              />
              <Group justify="flex-end">
                <Button
                  variant="default"
                  onClick={() => void close()}
                  disabled={!!busy}
                  loading={busy === "cancel"}
                >
                  Annulla
                </Button>
                <Button
                  color="red"
                  onClick={() => void restore()}
                  disabled={confirmation !== "RIPRISTINA" || !!busy}
                  loading={busy === "restore"}
                  leftSection={<IconRestore size={17} />}
                >
                  Ripristina dati
                </Button>
              </Group>
            </>
          )}
        </Stack>
      </Modal>
    </>
  );
}
