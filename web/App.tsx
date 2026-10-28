import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActionIcon,
  Alert,
  AppShell,
  Badge,
  Box,
  Burger,
  Button,
  Container,
  Divider,
  Group,
  Loader,
  Menu,
  Modal,
  NavLink,
  Paper,
  PasswordInput,
  Progress,
  ScrollArea,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  Tooltip,
} from "@mantine/core";
import { Calendar, DateInput } from "@mantine/dates";
import {
  IconAlertTriangle,
  IconArrowDown,
  IconArrowRight,
  IconBell,
  IconBuildingBank,
  IconBuildingCottage,
  IconCalendar,
  IconChartBar,
  IconChevronRight,
  IconDownload,
  IconFiles,
  IconHammer,
  IconHome,
  IconLayoutDashboard,
  IconLogout,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSettings,
  IconShieldCheck,
  IconTransfer,
  IconUsers,
  IconWallet,
} from "@tabler/icons-react";
import {
  entities,
  moneyFormat,
  monthlyPayment,
  type Row,
} from "../shared/model";
import { api, apiUrl } from "./api";
import { Detail, Editor, EntityPanel, Status, formatDate } from "./components";
import { BackupRestore } from "./BackupRestore";
import { APP_VERSION } from "../shared/version";
import {
  scoped,
  type Bootstrap,
  type CashTimeline,
  type EditorRequest,
} from "./types";

const navigation = [
  { id: "dashboard", label: "Dashboard", icon: IconLayoutDashboard },
  { id: "operation", label: "Operazione", icon: IconHome },
  { id: "sale", label: "Vendita", icon: IconTransfer },
  { id: "purchase", label: "Acquisto", icon: IconBuildingCottage },
  { id: "calendar", label: "Calendario e attività", icon: IconCalendar },
  { id: "documents", label: "Documenti", icon: IconFiles },
  { id: "contracts", label: "Contratti e obblighi", icon: IconShieldCheck },
  { id: "mortgages", label: "Mutuo", icon: IconBuildingBank },
  { id: "finance", label: "Finanze", icon: IconWallet },
  { id: "contacts", label: "Contatti", icon: IconUsers },
  { id: "works", label: "Lavori e preventivi", icon: IconHammer },
  { id: "reports", label: "Report", icon: IconChartBar },
  { id: "settings", label: "Impostazioni", icon: IconSettings },
];
const subtitles: Record<string, string> = {
  dashboard: "Vendita e acquisto, una visione d’insieme.",
  operation: "Immobili, dipendenze e decisioni della famiglia.",
  sale: "Dalla trattativa alla disponibilità dei proventi.",
  purchase: "Contratto, verifiche e preparazione della nuova casa.",
  calendar: "Scadenze contrattuali e impegni quotidiani, distinti e collegati.",
  documents: "Tutti i documenti, con provenienza, versioni e verifiche.",
  contracts: "Obblighi aperti, condizioni ed evidenze da raccogliere.",
  mortgages: "Confronta le proposte e segui ogni fase della pratica.",
  finance: "Disponibilità certe, previsioni e scenari modificabili.",
  contacts: "Persone e professionisti, con la prossima azione sempre visibile.",
  works: "Interventi, confronto preventivi e fornitori.",
  reports: "Riepiloghi da condividere e copie dei tuoi dati.",
  settings: "Preferenze, stati configurabili e protezione dei dati.",
};

export function App() {
  const [payload, setPayload] = useState<Bootstrap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(location.hash.slice(1) || "dashboard");
  const [operationId, setOperationId] = useState("");
  const [mobile, setMobile] = useState(false);
  const [editor, setEditor] = useState<EditorRequest | null>(null);
  const [detail, setDetail] = useState<{ entity: string; id: string } | null>(
    null,
  );
  const [auth, setAuth] = useState<boolean | null>(null);
  const [loginRequired, setLoginRequired] = useState(false);
  const [password, setPassword] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const loadedGeneration = useRef<string | undefined>(undefined);
  const refresh = useCallback(async () => {
    try {
      const result = await api<Bootstrap>("bootstrap");
      if (
        loadedGeneration.current &&
        loadedGeneration.current !== result.generation
      ) {
        setEditor(null);
        setDetail(null);
        setSearchOpen(false);
        setGlobalSearch("");
      }
      loadedGeneration.current = result.generation;
      setPayload(result);
      setOperationId((old) =>
        result.data.operations.some((o) => o.id === old)
          ? old
          : result.data.operations[0]?.id || "",
      );
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      throw e;
    }
  }, []);
  useEffect(() => {
    void api<{ authenticated: boolean; required: boolean }>("auth/status")
      .then((s) => {
        setAuth(s.authenticated);
        setLoginRequired(s.required);
        if (s.authenticated) void refresh().catch(() => {});
      })
      .catch((e) => setError((e as Error).message));
    const handler = () => setAuth(false);
    window.addEventListener("auth-required", handler);
    return () => window.removeEventListener("auth-required", handler);
  }, [refresh]);
  useEffect(() => {
    const handle = () => setPage(location.hash.slice(1) || "dashboard");
    window.addEventListener("hashchange", handle);
    return () => window.removeEventListener("hashchange", handle);
  }, []);
  function navigate(id: string) {
    location.hash = id;
    setPage(id);
    setMobile(false);
  }
  const openDetail = (entity: string, row: Row) =>
    setDetail({ entity, id: row.id });
  async function login() {
    setLoggingIn(true);
    try {
      await api("auth/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      setPassword("");
      setAuth(true);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoggingIn(false);
    }
  }
  if (auth === false)
    return (
      <div className="login-screen">
        <Paper withBorder p={40} w={420} maw="95vw">
          <ThemeIcon size={48} mb="lg" color="forest">
            <IconHome size={28} />
          </ThemeIcon>
          <Title order={1}>home manager</Title>
          <Text c="dimmed" mb="xl">
            Il tuo spazio per cambiare casa.
          </Text>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void login();
            }}
          >
            <Stack>
              {error && <Alert color="red">{error}</Alert>}
              <PasswordInput
                label="Password familiare"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                required
              />
              <Button type="submit" loading={loggingIn}>
                Accedi
              </Button>
            </Stack>
          </form>
        </Paper>
      </div>
    );
  if (!payload)
    return (
      <Container py={100}>
        <Stack align="center">
          <Loader />
          <Text>Caricamento della tua operazione…</Text>
          {error && (
            <Alert color="red" title="Servizio non disponibile">
              {error}
              <Button
                mt="md"
                variant="light"
                onClick={() => void refresh().catch(() => {})}
              >
                Riprova
              </Button>
            </Alert>
          )}
        </Stack>
      </Container>
    );
  const { data, dashboard } = payload;
  const operation =
    data.operations.find((o) => o.id === operationId) ?? data.operations[0];
  const rows = (entity: string) => scoped(data, entity, operationId);
  const activeTasks = dashboard.activeTasks.filter(
    (t) => t.operation_id === operationId,
  );
  const overdue = dashboard.overdue.filter(
    (t) => t.operation_id === operationId,
  );
  const deadlines = dashboard.deadlines.filter((d) =>
    rows("transactions").some((t) => t.id === d.transaction_id),
  );
  const blockers = dashboard.blockers.filter(
    (t) => t.operation_id === operationId,
  );
  const missing = dashboard.missingDocuments.filter(
    (d) => d.operation_id === operationId,
  );
  const selectedDetail = detail
    ? data[detail.entity]?.find((r) => r.id === detail.id)
    : undefined;
  const panel = (
    entity: string,
    preset: Record<string, string> = {},
    title?: string,
  ) => (
    <EntityPanel
      key={entity + JSON.stringify(preset)}
      entity={entity}
      data={data}
      operationId={operationId}
      edit={setEditor}
      detail={openDetail}
      preset={preset}
      title={title}
    />
  );
  const tabbed = (
    tabs: { entity: string; label?: string; preset?: Record<string, string> }[],
  ) => (
    <Tabs key={page} defaultValue={tabs[0].entity} variant="outline">
      <Tabs.List mb="lg">
        {tabs.map((t) => (
          <Tabs.Tab key={t.entity} value={t.entity}>
            {t.label ?? entities[t.entity].label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      {tabs.map((t) => (
        <Tabs.Panel key={t.entity} value={t.entity}>
          {panel(t.entity, t.preset)}
        </Tabs.Panel>
      ))}
    </Tabs>
  );
  const reminderDefault = Number(
    data.settings.find((s) => s.title === "reminder_days")?.value ?? 14,
  );
  const reminders = [
    ...activeTasks
      .filter(
        (t) =>
          t.due_date &&
          String(t.due_date) <= addDays(dashboard.today, reminderDefault),
      )
      .map((t) => ({ entity: "tasks", row: t })),
    ...deadlines
      .filter(
        (d) =>
          String(d.due_date) <=
          addDays(dashboard.today, Number(d.reminder_days ?? 14)),
      )
      .map((row) => ({ entity: "deadlines", row })),
  ];

  function dashboardPage() {
    const sale = rows("transactions").find((t) => t.kind === "sale");
    const purchase = rows("transactions").find((t) => t.kind === "purchase");
    const balance = purchase
      ? Number(purchase.final_price ?? purchase.agreed_price ?? 0) -
        Number(purchase.paid_deposit ?? 0)
      : null;
    const state = (row: Row | undefined) =>
      String(
        data.transaction_states.find((s) => s.id === row?.status)?.title ??
          "Da configurare",
      );
    return (
      <Stack gap="xl">
        <div className="welcome-banner">
          <div>
            <Text tt="uppercase" size="xs" fw={700} className="eyebrow">
              IL PERCORSO VERSO LA TUA NUOVA CASA
            </Text>
            <Title order={1}>
              {String(operation?.title ?? "La tua operazione")}
            </Title>
            <Text mt="sm">
              Due compravendite collegate. Tutto ciò che serve per il prossimo
              passo.
            </Text>
            <Button
              mt="lg"
              color="dark"
              variant="white"
              rightSection={<IconArrowRight size={16} />}
              onClick={() => navigate("operation")}
            >
              Apri l’operazione
            </Button>
          </div>
          <div className="house-art" aria-hidden="true">
            <IconBuildingCottage size={164} stroke={0.8} />
            <div className="house-ground" />
          </div>
        </div>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
          <Metric
            title="Vendita attuale"
            value={moneyFormat(sale?.final_price ?? sale?.agreed_price)}
            caption={state(sale)}
            status={sale?.price_state}
            icon={<IconTransfer size={21} />}
            onClick={() => navigate("sale")}
          />
          <Metric
            title="Saldo acquisto"
            value={moneyFormat(balance)}
            caption={`Caparra già versata: ${moneyFormat(purchase?.paid_deposit)}`}
            icon={<IconHome size={21} />}
            onClick={() => navigate("purchase")}
          />
          <Metric
            title="Liquidità attuale"
            value={moneyFormat(operation?.current_liquidity)}
            caption={
              operation?.liquidity_date
                ? `Saldo al ${formatDate(operation.liquidity_date)}`
                : "Importo esatto ancora da inserire"
            }
            status={operation?.liquidity_state}
            icon={<IconWallet size={21} />}
            onClick={() => navigate("finance")}
          />
          <Metric
            title="Documenti da gestire"
            value={String(missing.length)}
            caption="Mancanti, ricevuti o da verificare"
            icon={<IconFiles size={21} />}
            onClick={() => navigate("documents")}
          />
        </SimpleGrid>
        {overdue.length > 0 && (
          <Alert
            color="red"
            icon={<IconAlertTriangle size={19} />}
            title={`${overdue.length} attività scadute`}
          >
            <Button
              variant="subtle"
              color="red"
              px={0}
              onClick={() => navigate("calendar")}
            >
              Apri le attività da recuperare <IconArrowRight size={15} />
            </Button>
          </Alert>
        )}
        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="xl">
          <Paper withBorder p="lg">
            <Group justify="space-between" mb="lg">
              <Title order={3}>Le date da tenere d’occhio</Title>
              <ActionIcon
                variant="subtle"
                aria-label="Apri calendario"
                onClick={() => navigate("calendar")}
              >
                <IconArrowRight size={18} />
              </ActionIcon>
            </Group>
            <Stack gap="md">
              {deadlines.map((d) => (
                <button
                  className="deadline-row"
                  key={d.id}
                  onClick={() => openDetail("deadlines", d)}
                >
                  <div className="date-tile">
                    <span>{String(d.due_date).slice(8, 10)}</span>
                    <small>
                      {new Intl.DateTimeFormat("it-IT", {
                        month: "short",
                      }).format(new Date(`${d.due_date}T12:00:00Z`))}
                    </small>
                  </div>
                  <div className="grow">
                    <Text fw={600} size="sm">
                      {String(d.title)}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {formatDate(d.due_date)} · Scadenza contrattuale
                    </Text>
                  </div>
                  <Badge
                    color={
                      daysUntil(dashboard.today, String(d.due_date)) < 0
                        ? "red"
                        : "orange"
                    }
                    variant="light"
                  >
                    {daysUntil(dashboard.today, String(d.due_date)) < 0
                      ? "Scaduta"
                      : `${daysUntil(dashboard.today, String(d.due_date))} giorni`}
                  </Badge>
                </button>
              ))}
              {!deadlines.length && (
                <Text c="dimmed">Nessuna scadenza aperta registrata.</Text>
              )}
            </Stack>
          </Paper>
          <Paper withBorder p="lg">
            <Group justify="space-between" mb="lg">
              <Title order={3}>Richiedono attenzione</Title>
              <Badge color="orange" variant="light">
                {blockers.length}
              </Badge>
            </Group>
            <Stack gap="sm">
              {blockers.slice(0, 5).map((t) => (
                <button
                  className="task-row"
                  key={t.id}
                  onClick={() => openDetail("tasks", t)}
                >
                  <ThemeIcon variant="light" color="orange" size={30}>
                    <IconAlertTriangle size={16} />
                  </ThemeIcon>
                  <div className="grow">
                    <Text size="sm" fw={500}>
                      {String(t.title)}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {t.due_date
                        ? formatDate(t.due_date)
                        : "Scadenza interna da assegnare"}
                    </Text>
                  </div>
                  <IconChevronRight size={16} />
                </button>
              ))}
              {!blockers.length && (
                <Text c="dimmed">
                  Nessuna attività bloccante o ad alto rischio registrata.
                </Text>
              )}
            </Stack>
          </Paper>
        </SimpleGrid>
        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="xl">
          <Paper withBorder p="lg">
            <Group justify="space-between" mb="lg">
              <Title order={3}>Verso il rogito</Title>
              <Button
                variant="subtle"
                size="xs"
                onClick={() => navigate("contracts")}
              >
                Apri checklist
              </Button>
            </Group>
            <Stack>
              {dashboard.readiness
                .filter((c) =>
                  rows("checklists").some((r) => r.id === c.checklist.id),
                )
                .map((c) => (
                  <div key={c.checklist.id}>
                    <Group justify="space-between" mb={8}>
                      <Text fw={500} size="sm">
                        {String(c.checklist.title)}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {c.verified} / {c.total} verificati
                      </Text>
                    </Group>
                    <Progress
                      value={c.total ? (c.verified / c.total) * 100 : 0}
                      color="forest"
                      size="sm"
                    />
                    <Text mt={7} size="xs" c="dimmed">
                      {c.openObligations} obblighi aperti ·{" "}
                      {c.unverifiedDependencies} dipendenze da verificare
                    </Text>
                  </div>
                ))}
              <Text size="xs" c="dimmed">
                Indicatore organizzativo. La stipulabilità va verificata con il
                notaio.
              </Text>
            </Stack>
          </Paper>
          <Paper withBorder p="lg">
            <Group justify="space-between" mb="lg">
              <Title order={3}>Pratica di mutuo</Title>
              <ActionIcon
                aria-label="Apri mutui"
                variant="subtle"
                onClick={() => navigate("mortgages")}
              >
                <IconArrowRight size={18} />
              </ActionIcon>
            </Group>
            <Stack>
              {rows("mortgages").map((m) => (
                <div key={m.id}>
                  <Group justify="space-between">
                    <Text fw={500}>{String(m.title)}</Text>
                    <Status value={m.status} />
                  </Group>
                  <Text size="sm" c="dimmed" mt="sm">
                    Importo richiesto: {moneyFormat(m.requested_amount)} ·
                    Durata: {m.years} anni
                  </Text>
                  <Text size="xs" mt="sm" c="dimmed">
                    Delibera, stipula ed erogazione sono fasi distinte. Solo i
                    fondi effettivamente ricevuti diventano disponibilità.
                  </Text>
                </div>
              ))}
            </Stack>
          </Paper>
        </SimpleGrid>
      </Stack>
    );
  }

  function transactionPage(kind: "sale" | "purchase") {
    const transaction = rows("transactions").find((t) => t.kind === kind);
    if (!transaction) return panel("transactions", { kind });
    const property = rows("properties").find(
      (p) => p.id === transaction.property_id,
    );
    return (
      <Stack gap="xl">
        <Paper withBorder p="xl">
          <Group justify="space-between" align="flex-start">
            <div>
              <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
                {property?.locality}
              </Text>
              <Title order={2} mt="xs">
                {String(transaction.title)}
              </Title>
              <Text mt="sm" c="dimmed">
                {
                  data.transaction_states.find(
                    (s) => s.id === transaction.status,
                  )?.title
                }
              </Text>
            </div>
            <Button
              variant="light"
              onClick={() =>
                setEditor({ entity: "transactions", row: transaction })
              }
            >
              Modifica transazione
            </Button>
          </Group>
          <SimpleGrid mt="xl" cols={{ base: 1, sm: 3 }}>
            <div>
              <Text size="xs" c="dimmed">
                Prezzo{" "}
                {transaction.final_price
                  ? "definitivo"
                  : "pattuito / in trattativa"}
              </Text>
              <Title order={2}>
                {moneyFormat(
                  transaction.final_price ?? transaction.agreed_price,
                )}
              </Title>
              <Status value={transaction.price_state} />
            </div>
            <div>
              <Text size="xs" c="dimmed">
                Rogito previsto
              </Text>
              <Title order={3}>{formatDate(transaction.deed_expected)}</Title>
            </div>
            <div>
              <Text size="xs" c="dimmed">
                {kind === "purchase"
                  ? "Caparra versata"
                  : "Mutuo residuo verificato"}
              </Text>
              <Title order={2}>
                {moneyFormat(
                  kind === "purchase"
                    ? transaction.paid_deposit
                    : transaction.remaining_mortgage,
                )}
              </Title>
            </div>
          </SimpleGrid>
          <Text mt="lg" size="sm" c="dimmed">
            {String(transaction.notes ?? "")}
          </Text>
          {property && (
            <Button
              mt="md"
              variant="subtle"
              px={0}
              onClick={() => openDetail("properties", property)}
            >
              Apri scheda immobile <IconArrowRight size={16} />
            </Button>
          )}
        </Paper>
        {tabbed([
          { entity: "tasks", preset: { transaction_id: transaction.id } },
          { entity: "documents", preset: { transaction_id: transaction.id } },
          { entity: "obligations", preset: { transaction_id: transaction.id } },
          {
            entity: "transaction_parties",
            preset: { transaction_id: transaction.id },
          },
          { entity: "movements", preset: { transaction_id: transaction.id } },
        ])}
      </Stack>
    );
  }

  const content =
    page === "dashboard" ? (
      dashboardPage()
    ) : page === "operation" ? (
      tabbed([
        { entity: "operations" },
        { entity: "transactions" },
        { entity: "properties" },
        { entity: "cadastral_units" },
        { entity: "transaction_dependencies" },
        { entity: "communications" },
        { entity: "decisions" },
      ])
    ) : page === "sale" ? (
      transactionPage("sale")
    ) : page === "purchase" ? (
      transactionPage("purchase")
    ) : page === "calendar" ? (
      <CalendarPage
        data={data}
        operationId={operationId}
        panel={panel}
        detail={openDetail}
      />
    ) : page === "documents" ? (
      <Stack>
        <Alert variant="light" color="orange" icon={<IconFiles size={18} />}>
          Un documento caricato resta da verificare. Apri il dettaglio per file,
          versioni, anteprime e cronologia.
        </Alert>
        {tabbed([{ entity: "documents" }, { entity: "document_links" }])}
      </Stack>
    ) : page === "contracts" ? (
      <Stack>
        <Alert color="gray">
          Strumento organizzativo: verifiche tecniche e interpretazioni
          contrattuali competono ai professionisti.
        </Alert>
        {tabbed([
          { entity: "contracts" },
          { entity: "contract_clauses" },
          { entity: "obligations" },
          { entity: "checklists" },
          { entity: "checklist_items" },
        ])}
      </Stack>
    ) : page === "mortgages" ? (
      <Stack>
        <MortgageComparison rows={rows("mortgage_offers")} />
        {tabbed([{ entity: "mortgages" }, { entity: "mortgage_offers" }])}
      </Stack>
    ) : page === "finance" ? (
      <FinancePage
        payload={payload}
        operationId={operationId}
        edit={setEditor}
        panel={panel}
      />
    ) : page === "contacts" ? (
      tabbed([
        { entity: "people" },
        { entity: "organizations" },
        { entity: "transaction_parties" },
      ])
    ) : page === "works" ? (
      tabbed([
        { entity: "works" },
        { entity: "estimates" },
        { entity: "suppliers" },
      ])
    ) : page === "reports" ? (
      <Reports />
    ) : page === "settings" ? (
      <Stack>
        <Paper withBorder p="lg">
          <Title order={3}>Dati e installazione</Title>
          <Text c="dimmed" size="sm" mt="sm">
            home manager {APP_VERSION} · Fuso orario Europe/Rome · Valuta EUR
          </Text>
          <Text size="sm" mt="md">
            In Home Assistant, apri l’app dal pannello Ingress. Database e
            documenti sono conservati in /data e inclusi nei backup dell’add-on.
          </Text>
          <Group mt="md">
            <Button
              component="a"
              href={apiUrl("openapi.json")}
              target="_blank"
              variant="default"
            >
              Documentazione API
            </Button>
          </Group>
        </Paper>
        <BackupRestore
          onRestored={async () => {
            setEditor(null);
            setDetail(null);
            setSearchOpen(false);
            setGlobalSearch("");
            await refresh();
          }}
        />
        {tabbed([{ entity: "settings" }, { entity: "transaction_states" }])}
      </Stack>
    ) : (
      dashboardPage()
    );

  return (
    <>
      <AppShell
        navbar={{
          width: 248,
          breakpoint: "sm",
          collapsed: { mobile: !mobile },
        }}
        header={{ height: 76 }}
        padding={0}
      >
        <AppShell.Header>
          <Group h="100%" px={{ base: "md", sm: 28 }} justify="space-between">
            <Group>
              <Burger
                aria-label="Apri o chiudi il menu"
                opened={mobile}
                onClick={() => setMobile((v) => !v)}
                hiddenFrom="sm"
                size="sm"
              />
              <div className="brand">
                <IconBuildingCottage size={27} stroke={1.5} />
                <span>
                  home<span className="brand-light"> manager</span>
                </span>
              </div>
            </Group>
            <Group gap="xs">
              <Select
                aria-label="Operazione corrente"
                className="operation-picker"
                data={data.operations.map((o) => ({
                  value: o.id,
                  label: String(o.title),
                }))}
                value={operationId}
                onChange={(id) => {
                  if (id) setOperationId(id);
                }}
                w={240}
              />
              <Tooltip label="Cerca in tutta l’operazione">
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="lg"
                  aria-label="Ricerca globale"
                  onClick={() => setSearchOpen(true)}
                >
                  <IconSearch size={20} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Promemoria">
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="lg"
                  aria-label="Promemoria"
                  onClick={() => setNotificationsOpen(true)}
                >
                  <IconBell size={20} />
                  {reminders.length > 0 && (
                    <span className="notification-dot" />
                  )}
                </ActionIcon>
              </Tooltip>
              <Menu>
                <Menu.Target>
                  <ActionIcon
                    variant="light"
                    radius="xl"
                    size="lg"
                    aria-label="Menu famiglia"
                  >
                    <IconUsers size={19} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item
                    leftSection={<IconRefresh size={16} />}
                    onClick={() => void refresh().catch(() => {})}
                  >
                    Aggiorna dati
                  </Menu.Item>
                  {loginRequired && (
                    <Menu.Item
                      leftSection={<IconLogout size={16} />}
                      onClick={() =>
                        void api("auth/logout", { method: "POST" }).then(() => {
                          setAuth(false);
                          setPayload(null);
                        })
                      }
                    >
                      Esci
                    </Menu.Item>
                  )}
                </Menu.Dropdown>
              </Menu>
            </Group>
          </Group>
        </AppShell.Header>
        <AppShell.Navbar p="md">
          <Select
            hiddenFrom="sm"
            mb="lg"
            label="Operazione corrente"
            searchable
            data={data.operations.map((o) => ({
              value: o.id,
              label: String(o.title),
            }))}
            value={operationId}
            onChange={(id) => {
              if (id) setOperationId(id);
            }}
          />
          <AppShell.Section grow component={ScrollArea}>
            <Text className="nav-label" px="sm" mb="sm">
              LA TUA OPERAZIONE
            </Text>
            {navigation.map((item, i) => (
              <Box key={item.id}>
                {i === 4 && <Divider my="md" />}
                {i === 11 && <Divider my="md" />}
                <NavLink
                  href={`#${item.id}`}
                  active={page === item.id}
                  label={item.label}
                  leftSection={<item.icon size={18} stroke={1.6} />}
                  onClick={() => navigate(item.id)}
                  rightSection={
                    item.id === "calendar" && overdue.length ? (
                      <Badge size="xs" color="red">
                        {overdue.length}
                      </Badge>
                    ) : null
                  }
                />
              </Box>
            ))}
          </AppShell.Section>
          <AppShell.Section>
            <Paper className="sidebar-note" p="md" mt="md">
              <IconShieldCheck size={21} />
              <Text size="xs" fw={600} mt={6}>
                Uno spazio di famiglia
              </Text>
              <Text size="xs" c="dimmed">
                Dati locali. Ogni verifica resta esplicita.
              </Text>
            </Paper>
          </AppShell.Section>
        </AppShell.Navbar>
        <AppShell.Main>
          <Container fluid px={{ base: "md", md: 36 }} py={30} maw={1680}>
            <Group justify="space-between" align="flex-end" mb="xl">
              <div>
                <Text size="xs" c="dimmed" mb={6}>
                  OPERAZIONE IMMOBILIARE{" "}
                  <span className="breadcrumb-dot">/</span>{" "}
                  {navigation.find((n) => n.id === page)?.label ?? "Dashboard"}
                </Text>
                <Title order={1}>
                  {navigation.find((n) => n.id === page)?.label ?? "Dashboard"}
                </Title>
                <Text c="dimmed" size="sm" mt={7}>
                  {subtitles[page]}
                </Text>
              </div>
              <Button
                variant="default"
                leftSection={<IconPlus size={16} />}
                onClick={() =>
                  setEditor({
                    entity: "tasks",
                    preset: { operation_id: operationId },
                  })
                }
              >
                Nuova attività
              </Button>
            </Group>
            {error && (
              <Alert color="red" mb="lg">
                {error}
              </Alert>
            )}
            {content}
            <Text ta="center" size="xs" c="dimmed" mt={40} mb="sm">
              home manager · Le informazioni da verificare restano tali, fino
              alla conferma.
            </Text>
          </Container>
        </AppShell.Main>
      </AppShell>
      {editor && (
        <Editor
          key={editor.entity + (editor.row?.id ?? "new")}
          request={editor}
          data={data}
          operationId={operationId}
          close={() => setEditor(null)}
          refresh={refresh}
        />
      )}
      {detail && selectedDetail && (
        <Detail
          key={detail.id}
          entity={detail.entity}
          row={selectedDetail}
          data={data}
          close={() => setDetail(null)}
          edit={setEditor}
          refresh={refresh}
        />
      )}
      <Modal
        opened={searchOpen}
        onClose={() => setSearchOpen(false)}
        title="Cerca nell’operazione"
        size="lg"
      >
        <TextInput
          autoFocus
          placeholder="Titolo, contenuto o note…"
          value={globalSearch}
          onChange={(e) => setGlobalSearch(e.currentTarget.value)}
          leftSection={<IconSearch size={17} />}
        />
        <Stack mt="md">
          {globalSearch.trim().length < 2 ? (
            <Text c="dimmed" size="sm">
              Inserisci almeno due caratteri.
            </Text>
          ) : (
            Object.keys(entities)
              .flatMap((entity) =>
                rows(entity)
                  .filter((row) =>
                    Object.values(row).some((v) =>
                      String(v ?? "")
                        .toLocaleLowerCase("it")
                        .includes(globalSearch.toLocaleLowerCase("it")),
                    ),
                  )
                  .map((row) => ({ entity, row })),
              )
              .slice(0, 40)
              .map(({ entity, row }) => (
                <button
                  className="task-row"
                  key={row.id}
                  onClick={() => {
                    setSearchOpen(false);
                    openDetail(entity, row);
                  }}
                >
                  <div>
                    <Text size="sm" fw={600}>
                      {String(row.title)}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {entities[entity].label}
                    </Text>
                  </div>
                  <IconArrowRight size={16} />
                </button>
              ))
          )}
        </Stack>
      </Modal>
      <Modal
        opened={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        title="Promemoria interni"
        size="lg"
      >
        <Stack>
          {reminders.length ? (
            reminders.map(({ entity, row }) => (
              <button
                key={row.id}
                className="task-row"
                onClick={() => {
                  setNotificationsOpen(false);
                  openDetail(entity, row);
                }}
              >
                <div>
                  <Text size="sm" fw={500}>
                    {String(row.title)}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {formatDate(row.due_date)} ·{" "}
                    {entity === "deadlines"
                      ? "Scadenza contrattuale"
                      : "Attività interna"}
                  </Text>
                </div>
                <IconChevronRight size={16} />
              </button>
            ))
          ) : (
            <Text c="dimmed">Nessun promemoria nel periodo configurato.</Text>
          )}
        </Stack>
      </Modal>
    </>
  );
}

function Metric({
  title,
  value,
  caption,
  status,
  icon,
  onClick,
}: {
  title: string;
  value: string;
  caption: string;
  status?: Row[string];
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Paper
      component="button"
      withBorder
      className="metric"
      p="lg"
      onClick={onClick}
    >
      <Group justify="space-between" mb="md">
        <Text size="sm" c="dimmed">
          {title}
        </Text>
        <ThemeIcon variant="light" color="forest" size={34}>
          {icon}
        </ThemeIcon>
      </Group>
      <Text className="metric-value">{value}</Text>
      <Text size="xs" c="dimmed" mt={6}>
        {caption}
      </Text>
      {status && (
        <Box mt={10}>
          <Status value={status} />
        </Box>
      )}
    </Paper>
  );
}
function daysUntil(today: string, date: string) {
  return Math.round(
    (new Date(`${date}T12:00:00Z`).getTime() -
      new Date(`${today}T12:00:00Z`).getTime()) /
      86400000,
  );
}
function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

type Panel = (
  entity: string,
  preset?: Record<string, string>,
  title?: string,
) => React.ReactNode;
function CalendarPage({
  data,
  operationId,
  panel,
  detail,
}: {
  data: Bootstrap["data"];
  operationId: string;
  panel: Panel;
  detail: (entity: string, row: Row) => void;
}) {
  const [view, setView] = useState("month");
  const [selected, setSelected] = useState<string | null>(null);
  const events = [
    ...scoped(data, "deadlines", operationId).map((row) => ({
      entity: "deadlines",
      row,
      date: String(row.due_date),
    })),
    ...scoped(data, "tasks", operationId)
      .filter((row) => row.due_date)
      .map((row) => ({ entity: "tasks", row, date: String(row.due_date) })),
    ...scoped(data, "appointments", operationId).map((row) => ({
      entity: "appointments",
      row,
      date: new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Rome",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(String(row.starts_at))),
    })),
  ];
  const weekStart =
    selected ??
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Rome",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  return (
    <Stack gap="xl">
      <Paper withBorder p="lg">
        <Group justify="space-between" mb="lg">
          <Title order={3}>Calendario condiviso</Title>
          <SegmentedControl
            value={view}
            onChange={setView}
            data={[
              { value: "month", label: "Mese" },
              { value: "week", label: "Settimana" },
            ]}
          />
        </Group>
        <SimpleGrid cols={{ base: 1, md: 2 }}>
          {view === "month" ? (
            <Calendar
              size="md"
              fullWidth
              getDayProps={(date) => ({
                selected: selected === date,
                onClick: () => setSelected(date),
              })}
              renderDay={(date) => (
                <div>
                  {Number(date.slice(8, 10))}
                  {events.some((e) => e.date === date) && (
                    <span className="calendar-dot" />
                  )}
                </div>
              )}
            />
          ) : (
            <Stack>
              <DateInput
                label="Settimana a partire dal"
                value={weekStart}
                onChange={setSelected}
                valueFormat="DD/MM/YYYY"
              />
              {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map(
                (date) => (
                  <Group key={date}>
                    <Text size="sm" w={130}>
                      {formatDate(date)}
                    </Text>
                    <Text size="sm" c="dimmed">
                      {events.filter((e) => e.date === date).length} impegni
                    </Text>
                  </Group>
                ),
              )}
            </Stack>
          )}
          <Stack>
            <Group justify="space-between">
              <Text fw={600}>
                {view === "week"
                  ? "Impegni della settimana"
                  : selected
                    ? formatDate(selected)
                    : "Tutti gli impegni"}
              </Text>
              {selected && view === "month" && (
                <Button
                  variant="subtle"
                  size="xs"
                  onClick={() => setSelected(null)}
                >
                  Mostra tutti
                </Button>
              )}
            </Group>
            {events
              .filter((e) =>
                view === "week"
                  ? e.date >= weekStart && e.date <= addDays(weekStart, 6)
                  : !selected || e.date === selected,
              )
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((e) => (
                <button
                  className="task-row"
                  key={e.row.id}
                  onClick={() => detail(e.entity, e.row)}
                >
                  <div>
                    <Text size="sm" fw={500}>
                      {String(e.row.title)}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {formatDate(e.date)} ·{" "}
                      {e.entity === "deadlines"
                        ? "Contrattuale"
                        : e.entity === "tasks"
                          ? "Interna"
                          : "Appuntamento"}
                    </Text>
                  </div>
                  <IconChevronRight size={16} />
                </button>
              ))}
          </Stack>
        </SimpleGrid>
      </Paper>
      <Tabs defaultValue="tasks">
        <Tabs.List mb="lg">
          {[
            "tasks",
            "deadlines",
            "appointments",
            "task_dependencies",
            "task_items",
          ].map((entity) => (
            <Tabs.Tab key={entity} value={entity}>
              {entities[entity].label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        {[
          "tasks",
          "deadlines",
          "appointments",
          "task_dependencies",
          "task_items",
        ].map((entity) => (
          <Tabs.Panel key={entity} value={entity}>
            {panel(entity)}
          </Tabs.Panel>
        ))}
      </Tabs>
    </Stack>
  );
}

function MortgageComparison({ rows }: { rows: Row[] }) {
  return (
    <Paper withBorder p="lg">
      <Title order={3} mb="sm">
        Confronto delle proposte
      </Title>
      <Text size="sm" c="dimmed" mb="lg">
        Rate calcolate con ammortamento alla francese sul TAN. TAEG e costi
        devono essere confrontati con le offerte della banca.
      </Text>
      {!rows.length ? (
        <Text c="dimmed">
          Aggiungi le offerte ricevute per confrontarle qui.
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={600}>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Offerta</Table.Th>
                <Table.Th>Importo</Table.Th>
                <Table.Th>TAN / TAEG</Table.Th>
                <Table.Th>Rata stimata</Table.Th>
                <Table.Th>Rata banca</Table.Th>
                <Table.Th>Interessi stimati + spese</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((row) => {
                const payment =
                  typeof row.amount === "number" &&
                  typeof row.tan === "number" &&
                  Number(row.years) >= 1
                    ? monthlyPayment(
                        row.amount,
                        Number(row.tan),
                        Number(row.years),
                      )
                    : null;
                return (
                  <Table.Tr key={row.id}>
                    <Table.Td>{String(row.title)}</Table.Td>
                    <Table.Td>{moneyFormat(row.amount)}</Table.Td>
                    <Table.Td>
                      {row.tan ?? "—"}% / {row.taeg ?? "—"}%
                    </Table.Td>
                    <Table.Td>{moneyFormat(payment)}</Table.Td>
                    <Table.Td>{moneyFormat(row.bank_payment)}</Table.Td>
                    <Table.Td>
                      {moneyFormat(
                        payment === null
                          ? null
                          : payment * Number(row.years) * 12 -
                              Number(row.amount) +
                              Number(row.fees ?? 0),
                      )}
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Paper>
  );
}

function FinancePage({
  payload,
  operationId,
  edit,
  panel,
}: {
  payload: Bootstrap;
  operationId: string;
  edit: (r: EditorRequest) => void;
  panel: Panel;
}) {
  const [cash, setCash] = useState<CashTimeline | null>(null);
  const [cashError, setCashError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void api<CashTimeline>(`cash/${operationId}`)
      .then((result) => {
        if (alive) {
          setCash(result);
          setCashError(null);
        }
      })
      .catch((e) => {
        if (alive) setCashError((e as Error).message);
      });
    return () => {
      alive = false;
    };
  }, [operationId, payload]);
  const scenarios = payload.dashboard.scenarios.filter(
    (s) => s.scenario.operation_id === operationId,
  );
  return (
    <Stack gap="xl">
      <Alert
        color="orange"
        title="Gli scenari sono ipotesi, non fondi disponibili"
        icon={<IconAlertTriangle size={18} />}
      >
        Liquidità, prezzo di vendita, estinzione e TAN iniziali degli scenari
        sono simulazioni modificabili. Costi aggregati comprendono i lavori; i
        movimenti dettagliati sono un registro separato e non vengono sommati
        nuovamente agli scenari.
      </Alert>
      <SimpleGrid cols={{ base: 1, lg: 3 }}>
        {scenarios.map(({ scenario: s, result: r }) => (
          <Paper withBorder p="lg" key={s.id}>
            <Group justify="space-between" mb="lg">
              <Title order={3}>{String(s.title)}</Title>
              <Badge color="orange" variant="light">
                Simulazione
              </Badge>
            </Group>
            <Text size="xs" c="dimmed">
              Fabbisogno residuo da finanziare
            </Text>
            <Text className="scenario-amount">{moneyFormat(r.fundingGap)}</Text>
            <Stack gap={8} mt="lg">
              {[
                ["Saldo prezzo", r.balance],
                ["Proventi netti ipotizzati", r.netSale],
                ["Costi futuri aggregati", s.costs],
                ["Liquidità ipotizzata", s.liquidity],
                ["Nuovo mutuo ipotizzato", r.mortgage],
                ["Rata mensile stimata", r.monthlyPayment],
                ["Liquidità residua", r.residual],
                ["Margine sulla riserva", r.reserveMargin],
              ].map(([label, value]) => (
                <Group key={String(label)} justify="space-between">
                  <Text size="xs" c="dimmed">
                    {label}
                  </Text>
                  <Text size="sm" fw={500}>
                    {moneyFormat(value)}
                  </Text>
                </Group>
              ))}
            </Stack>
            <Divider my="md" />
            <Text size="xs" c="dimmed">
              {String(s.assumptions)}
            </Text>
            <Button
              fullWidth
              mt="lg"
              variant="light"
              onClick={() => edit({ entity: "scenarios", row: s })}
            >
              Modifica ipotesi
            </Button>
          </Paper>
        ))}
      </SimpleGrid>
      <Paper withBorder p="lg">
        <Title order={3} mb="md">
          Calendario finanziario
        </Title>
        {cashError && <Alert color="red">{cashError}</Alert>}
        {cash && !cash.openingKnown && (
          <Alert mb="md" color="orange">
            Manca un saldo iniziale esatto, confermato e datato. I saldi
            progressivi non vengono inventati. Inseriscilo nella scheda
            Operazione.
          </Alert>
        )}
        <Text size="sm" c="dimmed" mb="md">
          Entrate e uscite nella stessa giornata richiedono verifica dell’ordine
          dei trasferimenti. I movimenti effettivi anteriori o uguali alla data
          del saldo iniziale sono già inclusi in quel saldo.
        </Text>
        <Table.ScrollContainer minWidth={720}>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Data</Table.Th>
                <Table.Th>Movimento</Table.Th>
                <Table.Th>Importo</Table.Th>
                <Table.Th>Stato</Table.Th>
                <Table.Th>Saldo da movimenti effettivi</Table.Th>
                <Table.Th>Scostamento dal previsto</Table.Th>
                <Table.Th>Saldo previsto</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {cash?.events.map((e) => (
                <Table.Tr key={e.id}>
                  <Table.Td>{formatDate(e.date)}</Table.Td>
                  <Table.Td>
                    <Text size="sm">{String(e.title)}</Text>
                    {e.sameDayOrderUnverified && (
                      <Text size="xs" c="orange">
                        Ordine nella giornata da verificare
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {e.direction === "in" ? "+" : "−"}
                    {moneyFormat(e.amount)}
                  </Table.Td>
                  <Table.Td>
                    <Status value={e.status} />
                  </Table.Td>
                  <Table.Td>{moneyFormat(e.actualBalance)}</Table.Td>
                  <Table.Td>
                    {e.variance === null
                      ? "Da consuntivare"
                      : moneyFormat(e.variance)}
                  </Table.Td>
                  <Table.Td>{moneyFormat(e.projectedBalance)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {cash && !cash.events.length && (
          <Text c="dimmed" size="sm" py="lg">
            Nessun movimento futuro datato. Registra separatamente gli incassi
            lordi, l’estinzione e le uscite.
          </Text>
        )}
        <Text size="xs" c="dimmed" mt="md">
          {cash?.excluded.length ?? 0} movimenti senza data o già inclusi nel
          saldo iniziale esclusi dalla progressione.
        </Text>
      </Paper>
      <Tabs defaultValue="movements">
        <Tabs.List mb="lg">
          <Tabs.Tab value="movements">Movimenti</Tabs.Tab>
          <Tabs.Tab value="scenarios">Ipotesi scenari</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="movements">{panel("movements")}</Tabs.Panel>
        <Tabs.Panel value="scenarios">{panel("scenarios")}</Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

function Reports() {
  const [entity, setEntity] = useState("tasks");
  const scopes = [
    ["all", "Operazione completa"],
    ["transactions", "Vendita e acquisto"],
    ["deadlines", "Scadenze contrattuali"],
    ["tasks", "Attività e scadenze interne"],
    ["missing-documents", "Documenti mancanti o da verificare"],
    ["open-obligations", "Obblighi contrattuali aperti"],
    ["scenarios", "Riepilogo finanziario"],
    ["movements", "Pagamenti previsti e consuntivi"],
    ["mortgages", "Stato pratiche mutuo"],
    ["checklist_items", "Checklist del rogito"],
    ["completed-tasks", "Attività completate"],
  ];
  return (
    <Stack gap="xl">
      <Paper withBorder p="xl">
        <Title order={2}>Report da condividere</Title>
        <Text c="dimmed" size="sm" mt="xs" mb="xl">
          PDF leggibili e stampabili, con lo stato delle informazioni
          registrate.
        </Text>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
          {scopes.map(([scope, label]) => (
            <Button
              key={scope}
              component="a"
              href={apiUrl(`export/pdf/${scope}`)}
              variant="default"
              leftSection={<IconDownload size={17} />}
              justify="space-between"
              h={52}
            >
              {label}
            </Button>
          ))}
        </SimpleGrid>
      </Paper>
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Paper withBorder p="xl">
          <Title order={3}>Dati strutturati</Title>
          <Text size="sm" c="dimmed" my="md">
            Il JSON include tutti i dati e i metadati. I file originali sono
            inclusi nell’archivio ZIP e nel backup. Importi CSV in centesimi di
            euro, date ISO.
          </Text>
          <Group>
            <Select
              aria-label="Tabella da esportare"
              searchable
              value={entity}
              onChange={(v) => {
                if (v) setEntity(v);
              }}
              data={Object.entries(entities).map(([value, d]) => ({
                value,
                label: d.label,
              }))}
            />
            <Button
              component="a"
              variant="light"
              href={apiUrl(`export/csv/${entity}`)}
            >
              CSV
            </Button>
            <Button component="a" variant="light" href={apiUrl("export/json")}>
              JSON completo
            </Button>
          </Group>
        </Paper>
        <Paper withBorder p="xl">
          <Title order={3}>Archivio e backup</Title>
          <Text c="dimmed" size="sm" my="md">
            L’archivio organizza i file per documento e versione. Il backup
            aggiunge il database SQLite, il manifest e gli hash per un
            ripristino verificabile.
          </Text>
          <Group>
            <Button
              component="a"
              href={apiUrl("export/archive")}
              variant="light"
              leftSection={<IconArrowDown size={16} />}
            >
              Archivio documenti
            </Button>
            <Button
              component="a"
              href={apiUrl("backup")}
              leftSection={<IconDownload size={16} />}
            >
              Backup completo
            </Button>
          </Group>
        </Paper>
      </SimpleGrid>
    </Stack>
  );
}
