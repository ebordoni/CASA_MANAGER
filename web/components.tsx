import { useEffect, useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Checkbox,
  Divider,
  Drawer,
  FileButton,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import {
  IconArrowDown,
  IconEye,
  IconFile,
  IconHistory,
  IconPencil,
  IconPlus,
  IconSearch,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import {
  entities,
  labels,
  moneyFormat,
  schemaFor,
  type Row,
  type Scalar,
} from "../shared/model";
import { api, apiUrl } from "./api";
import { scoped, type Data, type EditorRequest } from "./types";

export const formatDate = (input: Scalar | undefined) =>
  input
    ? new Intl.DateTimeFormat("it-IT", {
        dateStyle: "medium",
        timeZone: "Europe/Rome",
      }).format(
        new Date(
          String(input).length === 10 ? `${input}T12:00:00Z` : String(input),
        ),
      )
    : "Da definire";
export function Status({ value }: { value: Scalar | undefined }) {
  const state = String(value ?? "unverified");
  const color = [
    "verified",
    "completed",
    "fulfilled",
    "satisfied",
    "disbursed",
    "paid",
  ].includes(state)
    ? "teal"
    : ["blocked", "critical", "urgent", "refused"].includes(state)
      ? "red"
      : [
            "unverified",
            "provisional",
            "estimated",
            "high",
            "to_request",
            "todo",
          ].includes(state)
        ? "orange"
        : "gray";
  return (
    <Badge color={color} variant="light" size="sm" radius="sm">
      {labels[state] ?? state}
    </Badge>
  );
}
export function Value({
  entity,
  field,
  row,
  data,
}: {
  entity: string;
  field: string;
  row: Row;
  data: Data;
}) {
  const f = entities[entity]?.fields[field];
  const value = row[field];
  if (value === null || value === undefined || value === "")
    return (
      <Text c="dimmed" size="sm">
        Da definire
      </Text>
    );
  if (f?.ref)
    return (
      <Text size="sm">
        {String(data[f.ref]?.find((r) => r.id === value)?.title ?? value)}
      </Text>
    );
  if (f?.options) return <Status value={value} />;
  if (f?.type === "money")
    return (
      <Text size="sm" fw={500} style={{ whiteSpace: "nowrap" }}>
        {moneyFormat(value)}
      </Text>
    );
  if (f?.type === "date" || f?.type === "datetime" || field === "updated_at")
    return <Text size="sm">{formatDate(value)}</Text>;
  return (
    <Text size="sm" lineClamp={2}>
      {String(value)}
    </Text>
  );
}

export function EntityPanel({
  entity,
  data,
  operationId,
  edit,
  detail,
  preset = {},
  title,
}: {
  entity: string;
  data: Data;
  operationId: string;
  edit: (r: EditorRequest) => void;
  detail: (entity: string, row: Row) => void;
  preset?: Record<string, string>;
  title?: string;
}) {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string | null>>({});
  const def = entities[entity];
  const rows = scoped(data, entity, operationId)
    .filter((row) =>
      Object.entries(preset).every(([key, val]) => row[key] === val),
    )
    .filter((row) =>
      Object.values(row).some((val) =>
        String(val ?? "")
          .toLocaleLowerCase("it")
          .includes(search.toLocaleLowerCase("it")),
      ),
    )
    .filter((row) =>
      Object.entries(filters).every(([key, val]) => !val || row[key] === val),
    );
  const filterFields = Object.entries(def.fields).filter(
    ([key, f]) =>
      [
        "status",
        "category",
        "priority",
        "responsible_id",
        "transaction_id",
      ].includes(key) &&
      (f.options || f.ref || key === "category") &&
      !preset[key],
  );
  return (
    <Paper withBorder p="lg" className="entity-panel">
      <Group justify="space-between" mb="md">
        <div>
          <Title order={3}>{title ?? def.label}</Title>
          <Text size="xs" c="dimmed">
            {rows.length} {rows.length === 1 ? "elemento" : "elementi"}
          </Text>
        </div>
        <Button
          size="sm"
          leftSection={<IconPlus size={16} />}
          onClick={() =>
            edit({ entity, preset: { operation_id: operationId, ...preset } })
          }
        >
          Aggiungi {def.singular}
        </Button>
      </Group>
      <Group mb="lg" align="flex-end">
        <TextInput
          aria-label={`Cerca in ${def.label}`}
          placeholder="Cerca per titolo, descrizione o note…"
          leftSection={<IconSearch size={16} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          style={{ flex: 1, minWidth: 200 }}
        />
        {filterFields.map(([key, f]) => (
          <Select
            key={key}
            clearable
            searchable
            aria-label={`Filtra ${f.label}`}
            placeholder={f.label}
            w={170}
            value={filters[key] ?? null}
            onChange={(val) => setFilters((old) => ({ ...old, [key]: val }))}
            data={
              f.options
                ? f.options.map((value) => ({
                    value,
                    label: labels[value] ?? value,
                  }))
                : f.ref
                  ? scoped(data, f.ref, operationId).map((row) => ({
                      value: row.id,
                      label: String(row.title),
                    }))
                  : [
                      ...new Set(
                        scoped(data, entity, operationId)
                          .map((row) => String(row[key] ?? ""))
                          .filter(Boolean),
                      ),
                    ]
            }
          />
        ))}
      </Group>
      <Table.ScrollContainer minWidth={650}>
        <Table verticalSpacing="md" highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              {def.columns.map((key) => (
                <Table.Th key={key}>
                  {def.fields[key]?.label ??
                    (key === "updated_at" ? "Ultima modifica" : key)}
                </Table.Th>
              ))}
              <Table.Th>
                <Text size="xs" ta="right">
                  Azioni
                </Text>
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((row) => (
              <Table.Tr key={row.id}>
                {def.columns.map((key, i) => (
                  <Table.Td key={key}>
                    {i === 0 ? (
                      <Button
                        className="row-title"
                        variant="subtle"
                        color="dark"
                        px={0}
                        h="auto"
                        onClick={() => detail(entity, row)}
                      >
                        {String(row[key])}
                      </Button>
                    ) : (
                      <Value
                        entity={entity}
                        field={key}
                        row={row}
                        data={data}
                      />
                    )}
                  </Table.Td>
                ))}
                <Table.Td>
                  <Group justify="flex-end" gap={5}>
                    <Tooltip label="Apri dettaglio">
                      <ActionIcon
                        variant="subtle"
                        aria-label={`Apri ${row.title}`}
                        onClick={() => detail(entity, row)}
                      >
                        <IconEye size={17} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Modifica">
                      <ActionIcon
                        variant="subtle"
                        aria-label={`Modifica ${row.title}`}
                        onClick={() => edit({ entity, row })}
                      >
                        <IconPencil size={17} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {!rows.length && (
        <Stack align="center" py={40} gap="xs">
          <IconFile size={30} color="#8a9691" />
          <Text fw={500}>Nessun elemento da mostrare</Text>
          <Text size="sm" c="dimmed">
            Aggiungi un elemento o modifica i filtri.
          </Text>
        </Stack>
      )}
    </Paper>
  );
}

export function Editor({
  request,
  data,
  operationId,
  close,
  refresh,
}: {
  request: EditorRequest;
  data: Data;
  operationId: string;
  close: () => void;
  refresh: () => Promise<void>;
}) {
  const { entity, row, preset } = request;
  const def = entities[entity];
  const values: Record<string, Scalar> = Object.fromEntries(
    Object.entries(def.fields).map(([key, f]) => [
      key,
      row?.[key] ??
        preset?.[key] ??
        (key === "operation_id" ? operationId : (f.default ?? null)),
    ]),
  );
  const form = useForm<Record<string, Scalar>>({
    initialValues: values,
    validate: (input) => {
      const result = schemaFor(entity).safeParse(input);
      return result.success
        ? {}
        : Object.fromEntries(
            result.error.issues.map((i) => [String(i.path[0]), i.message]),
          );
    },
  });
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attemptClose = () => (form.isDirty() ? setDiscard(true) : close());
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (form.isDirty()) e.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [form]);
  async function save(input: Record<string, Scalar>) {
    setSaving(true);
    setError(null);
    try {
      await api(`entities/${entity}${row ? `/${row.id}` : ""}`, {
        method: row ? "PUT" : "POST",
        body: JSON.stringify(
          row
            ? {
                data: input,
                revision: row.revision,
                confirmTransition: confirm,
              }
            : input,
        ),
      });
      notifications.show({
        title: "Salvataggio completato",
        message: `${def.singular.charAt(0).toUpperCase() + def.singular.slice(1)} salvato.`,
        color: "teal",
      });
      await refresh();
      close();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <Modal
        opened
        onClose={attemptClose}
        closeOnClickOutside={false}
        title={
          <Title order={3}>
            {row ? "Modifica" : "Nuovo elemento"} · {def.singular}
          </Title>
        }
        size="xl"
        centered
      >
        <form onSubmit={form.onSubmit(save)}>
          <Stack>
            <Text size="sm" c="dimmed">
              I campi contrassegnati con * sono obbligatori. Gli importi sono
              espressi in euro.
            </Text>
            {error && (
              <Alert color="red" title="Salvataggio non riuscito">
                {error}
              </Alert>
            )}
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              {Object.entries(def.fields).map(([key, f]) => {
                const common = {
                  label: f.label,
                  withAsterisk: f.required,
                  error: form.errors[key],
                };
                const value = form.values[key];
                const change = (v: Scalar) => form.setFieldValue(key, v);
                if (f.ref) {
                  const refs =
                    f.ref === "document_versions"
                      ? (data.document_versions ?? []).map((v) => ({
                          value: v.id,
                          label: `${data.documents.find((d) => d.id === v.document_id)?.title} · v${v.version} · ${v.filename}`,
                        }))
                      : scoped(data, f.ref, operationId)
                          .filter(
                            (r) => !(f.ref === entity && row?.id === r.id),
                          )
                          .map((r) => ({
                            value: r.id,
                            label: String(r.title),
                          }));
                  return (
                    <Select
                      key={key}
                      {...common}
                      searchable
                      clearable={!f.required}
                      value={value ? String(value) : null}
                      data={refs}
                      onChange={change}
                      nothingFoundMessage="Nessun elemento: crealo nella sezione corrispondente"
                    />
                  );
                }
                if (f.options)
                  return (
                    <Select
                      key={key}
                      {...common}
                      value={value ? String(value) : null}
                      data={f.options.map((value) => ({
                        value,
                        label: labels[value] ?? value,
                      }))}
                      onChange={change}
                    />
                  );
                if (f.type === "date")
                  return (
                    <DateInput
                      key={key}
                      {...common}
                      value={value ? String(value) : null}
                      onChange={change}
                      valueFormat="DD/MM/YYYY"
                      clearable
                      placeholder="gg/mm/aaaa"
                    />
                  );
                if (f.type === "datetime")
                  return (
                    <TextInput
                      key={key}
                      {...common}
                      type="datetime-local"
                      value={
                        value
                          ? new Date(
                              new Date(String(value)).getTime() -
                                new Date(String(value)).getTimezoneOffset() *
                                  60000,
                            )
                              .toISOString()
                              .slice(0, 16)
                          : ""
                      }
                      onChange={(e) =>
                        change(
                          e.currentTarget.value
                            ? new Date(e.currentTarget.value).toISOString()
                            : null,
                        )
                      }
                    />
                  );
                if (f.type === "money" || f.type === "number")
                  return (
                    <NumberInput
                      key={key}
                      {...common}
                      value={
                        typeof value === "number"
                          ? value / (f.type === "money" ? 100 : 1)
                          : ""
                      }
                      min={0}
                      max={f.max}
                      decimalScale={f.type === "money" ? 2 : 4}
                      thousandSeparator="."
                      decimalSeparator=","
                      suffix={f.type === "money" ? " €" : undefined}
                      onChange={(v) =>
                        change(
                          v === ""
                            ? null
                            : f.type === "money"
                              ? Math.round(Number(v) * 100)
                              : Number(v),
                        )
                      }
                    />
                  );
                if (f.type === "long")
                  return (
                    <Textarea
                      key={key}
                      {...common}
                      autosize
                      minRows={3}
                      value={String(value ?? "")}
                      onChange={(e) => change(e.currentTarget.value || null)}
                      style={{ gridColumn: "1/-1" }}
                    />
                  );
                return (
                  <TextInput
                    key={key}
                    {...common}
                    type={f.type === "email" ? "email" : "text"}
                    value={String(value ?? "")}
                    onChange={(e) => change(e.currentTarget.value || null)}
                  />
                );
              })}
            </SimpleGrid>
            {row && ["transactions", "deadlines"].includes(entity) && (
              <Checkbox
                label="Confermo consapevolmente la transizione non ordinaria o la modifica del termine, dopo le verifiche necessarie."
                checked={confirm}
                onChange={(e) => setConfirm(e.currentTarget.checked)}
              />
            )}
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={attemptClose}>
                Annulla
              </Button>
              <Button type="submit" loading={saving}>
                Salva modifiche
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
      <Modal
        opened={discard}
        onClose={() => setDiscard(false)}
        title="Modifiche non salvate"
        centered
      >
        <Text>Vuoi scartare le modifiche?</Text>
        <Group justify="flex-end" mt="lg">
          <Button variant="default" onClick={() => setDiscard(false)}>
            Continua a modificare
          </Button>
          <Button color="red" onClick={close}>
            Scarta modifiche
          </Button>
        </Group>
      </Modal>
    </>
  );
}

export function Detail({
  entity,
  row,
  data,
  close,
  edit,
  refresh,
}: {
  entity: string;
  row: Row;
  data: Data;
  close: () => void;
  edit: (r: EditorRequest) => void;
  refresh: () => Promise<void>;
}) {
  const def = entities[entity];
  const [deleting, setDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<Row | null>(null);
  const [comparison, setComparison] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const versions = (data.document_versions ?? [])
    .filter((v) => v.document_id === row.id)
    .sort((a, b) => Number(b.version) - Number(a.version));
  const audit = (data.audit_events ?? [])
    .filter((a) => a.entity === entity && a.entity_id === row.id)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  async function upload(file: File | null) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      await api(`documents/${row.id}/versions`, {
        method: "POST",
        body: form,
        headers: { "If-Match": String(row.revision) },
      });
      await refresh();
      notifications.show({
        title: "Versione caricata",
        message: "Il documento resta da verificare manualmente.",
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  async function remove() {
    try {
      await api(`entities/${entity}/${row.id}`, {
        method: "DELETE",
        body: JSON.stringify({
          revision: row.revision,
          confirmTitle: confirmation,
        }),
      });
      await refresh();
      close();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <Drawer
        opened
        onClose={close}
        title={<Title order={3}>{String(row.title)}</Title>}
        position="right"
        size="xl"
      >
        <Group mb="lg">
          <Button
            variant="light"
            leftSection={<IconPencil size={16} />}
            onClick={() => {
              close();
              edit({ entity, row });
            }}
          >
            Modifica
          </Button>
          <Button
            variant="subtle"
            color="red"
            leftSection={<IconTrash size={16} />}
            onClick={() => setDeleting(true)}
          >
            Elimina
          </Button>
        </Group>
        {error && (
          <Alert color="red" mb="md">
            {error}
          </Alert>
        )}
        <Tabs defaultValue="details">
          <Tabs.List>
            <Tabs.Tab value="details">Dettagli</Tabs.Tab>
            {entity === "documents" && (
              <Tabs.Tab value="files">
                File e versioni ({versions.length})
              </Tabs.Tab>
            )}
            <Tabs.Tab value="history" leftSection={<IconHistory size={15} />}>
              Cronologia
            </Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="details" pt="lg">
            <Stack>
              {Object.keys(def.fields).map((key) => (
                <div key={key}>
                  <Text size="xs" fw={600} c="dimmed" mb={3}>
                    {def.fields[key].label}
                  </Text>
                  <Value entity={entity} field={key} row={row} data={data} />
                </div>
              ))}
              <Divider />
              <Text size="xs" c="dimmed">
                Creato {formatDate(row.created_at)} · Revisione {row.revision}
              </Text>
            </Stack>
          </Tabs.Panel>
          {entity === "documents" && (
            <Tabs.Panel value="files" pt="lg">
              <Stack>
                <Alert color="orange">
                  Il caricamento di un file o di una nuova versione non verifica
                  il documento. Ogni nuova versione richiede una verifica
                  manuale.
                </Alert>
                <FileButton
                  onChange={upload}
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.eml,.csv,.docx,.xlsx,.odt"
                >
                  {(props) => (
                    <Button
                      {...props}
                      loading={uploading}
                      leftSection={<IconUpload size={16} />}
                    >
                      Carica{" "}
                      {versions.length ? "nuova versione" : "file originale"}{" "}
                      (max 25 MB)
                    </Button>
                  )}
                </FileButton>
                {versions.map((v) => (
                  <Paper withBorder p="md" key={v.id}>
                    <Group justify="space-between">
                      <div>
                        <Text fw={600}>
                          v{v.version} · {v.filename}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {formatDate(v.created_at)} ·{" "}
                          {(Number(v.size) / 1024).toFixed(1)} KB
                        </Text>
                      </div>
                      <Group gap="xs">
                        <ActionIcon
                          component="a"
                          href={apiUrl(`versions/${v.id}/file`)}
                          aria-label="Scarica originale"
                          variant="light"
                        >
                          <IconArrowDown size={16} />
                        </ActionIcon>
                        {(v.mime === "application/pdf" ||
                          String(v.mime).startsWith("image/")) && (
                          <ActionIcon
                            variant="light"
                            aria-label="Anteprima"
                            onClick={() => setPreview(v)}
                          >
                            <IconEye size={16} />
                          </ActionIcon>
                        )}
                      </Group>
                    </Group>
                    <Text
                      size="xs"
                      c="dimmed"
                      mt="xs"
                      style={{ wordBreak: "break-all" }}
                    >
                      SHA-256: {v.hash}
                    </Text>
                    <Checkbox
                      mt="xs"
                      label="Seleziona per confronto"
                      checked={comparison.includes(v.id)}
                      onChange={(e) => {
                        const checked = e.currentTarget.checked;
                        setComparison((old) =>
                          checked
                            ? [
                                ...old.filter((id) => id !== v.id).slice(-1),
                                v.id,
                              ]
                            : old.filter((id) => id !== v.id),
                        );
                      }}
                    />
                  </Paper>
                ))}
                {comparison.length === 2 && (
                  <Button
                    variant="default"
                    onClick={() => setCompareOpen(true)}
                  >
                    Confronta le due versioni
                  </Button>
                )}
                {!versions.length && (
                  <Text c="dimmed">
                    Il documento è registrato, ma nessun file è stato caricato.
                  </Text>
                )}
              </Stack>
            </Tabs.Panel>
          )}
          <Tabs.Panel value="history" pt="lg">
            <Stack>
              {audit.map((a) => (
                <Paper key={a.id} withBorder p="md">
                  <Text fw={600} size="sm">
                    {a.action === "create"
                      ? "Creazione"
                      : a.action === "delete"
                        ? "Eliminazione"
                        : "Modifica"}{" "}
                    · {formatDate(a.created_at)}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {a.actor === "initial-import"
                      ? "Importazione dati iniziali"
                      : "Modifica familiare"}
                  </Text>
                  {a.action === "update" && (
                    <div className="audit-changes">
                      {Object.entries(JSON.parse(String(a.after_json)) as Row)
                        .filter(
                          ([k, v]) =>
                            !["updated_at", "revision"].includes(k) &&
                            JSON.parse(String(a.before_json))?.[k] !== v,
                        )
                        .map(([key, val]) => (
                          <Text size="sm" key={key}>
                            {def.fields[key]?.label ?? key}:{" "}
                            {String(
                              JSON.parse(String(a.before_json))?.[key] ?? "—",
                            )}{" "}
                            → {String(val ?? "—")}
                          </Text>
                        ))}
                    </div>
                  )}
                </Paper>
              ))}
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </Drawer>
      <Modal
        opened={deleting}
        onClose={() => setDeleting(false)}
        title="Conferma eliminazione"
        centered
      >
        <Stack>
          <Text>
            Per eliminare questo elemento, digita il titolo esatto. I
            collegamenti ad altri dati possono impedirne l’eliminazione.
          </Text>
          <Text fw={600}>{String(row.title)}</Text>
          <TextInput
            label="Titolo di conferma"
            value={confirmation}
            onChange={(e) => setConfirmation(e.currentTarget.value)}
          />
          {error && <Alert color="red">{error}</Alert>}
          <Button
            color="red"
            disabled={confirmation !== row.title}
            onClick={remove}
          >
            Elimina definitivamente
          </Button>
        </Stack>
      </Modal>
      <Modal
        opened={!!preview}
        onClose={() => setPreview(null)}
        title={String(preview?.filename ?? "Anteprima")}
        size="90%"
      >
        {preview && (
          <iframe
            className="preview-frame"
            title="Anteprima documento"
            src={apiUrl(`versions/${preview.id}/file?inline=true`)}
          />
        )}
      </Modal>
      <Modal
        opened={compareOpen}
        onClose={() => setCompareOpen(false)}
        title="Confronto versioni"
        size="95%"
      >
        <Alert mb="md">
          Confronto visivo dei file originali. Le modifiche contrattuali vanno
          riscontrate da un professionista.
        </Alert>
        <SimpleGrid cols={{ base: 1, md: 2 }}>
          {comparison.map((id) => {
            const v = versions.find((v) => v.id === id)!;
            return (
              <div key={id}>
                <Text fw={600} mb="xs">
                  v{v.version} · {v.filename}
                </Text>
                {v.mime === "application/pdf" ||
                String(v.mime).startsWith("image/") ? (
                  <iframe
                    className="preview-frame"
                    title={`Versione ${v.version}`}
                    src={apiUrl(`versions/${v.id}/file?inline=true`)}
                  />
                ) : (
                  <Button component="a" href={apiUrl(`versions/${v.id}/file`)}>
                    Scarica per confrontare
                  </Button>
                )}
              </div>
            );
          })}
        </SimpleGrid>
      </Modal>
    </>
  );
}
