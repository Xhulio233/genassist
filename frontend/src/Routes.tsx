import {
  createBrowserRouter,
  Navigate,
  Outlet,
  RouterProvider,
} from "react-router-dom";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import ProtectedRoute from "@/layout/ProtectedRoute";
import { FeatureFlags as FeatureFlagKeys } from "@/config/featureFlags";
import { useFeatureFlagVisible } from "@/components/featureFlag";
import { GlobalChat } from "./components/GlobalChat";
import ServerDownPage from "@/components/ServerDownPage";
import ServerStatusBanner from "@/components/ServerStatusBanner";
import { useServerStatus } from "@/context/ServerStatusContext";
import { getRegistrationStatus } from "@/services/registration";
import { RoutesContext } from "@/context/RoutesContext";
import { WebSocketDashboardProvider } from "@/context/WebSocketDashboardContext";
import { storage } from "@/lib/storage";

// --- Route pages, lazily loaded so each becomes its own bundle chunk fetched
// only when its route is first visited — keeps the initial payload small. ---
const Register = lazy(() =>
  import("@/views/Register").then((m) => ({ default: m.Register }))
);
const Login = lazy(() =>
  import("@/views/Login").then((m) => ({ default: m.Login }))
);
const ChangePassword = lazy(() =>
  import("@/views/Login").then((m) => ({ default: m.ChangePassword }))
);
const LoginSsoCallback = lazy(() =>
  import("@/views/Login").then((m) => ({ default: m.LoginSsoCallback }))
);
const Index = lazy(() => import("@/views/Index"));
const Transcripts = lazy(() => import("./views/Transcripts"));
const Operators = lazy(() => import("./views/Operators"));
const Analytics = lazy(() => import("@/views/Analytics"));
const AgentPerformancePage = lazy(
  () => import("@/views/Analytics/pages/AgentPerformancePage")
);
const NodeAnalyticsPage = lazy(
  () => import("@/views/Analytics/pages/NodeAnalyticsPage")
);
const ReportedFeedback = lazy(() => import("@/views/ReportedFeedback/Index"));
const Notifications = lazy(() => import("@/views/Notifications"));
const Settings = lazy(() => import("./views/Settings"));
const NotFound = lazy(() => import("@/views/NotFound"));
const Roles = lazy(() => import("@/views/Roles/pages/Roles"));
const UserGroups = lazy(() => import("@/views/UserGroups/Index"));
const Users = lazy(() => import("./views/Users/Index"));
const GdprConversations = lazy(() => import("./views/GdprConversations/Index"));
const UserTypes = lazy(() => import("./views/UserTypes/pages/UserTypes"));
const ApiKeys = lazy(() => import("./views/ApiKeys/pages/ApiKeys"));
const AppSettings = lazy(() => import("./views/AppSettings/Index"));
const AIAgents = lazy(() => import("./views/AIAgents/Index"));
const DataSources = lazy(() => import("./views/DataSources/pages/DataSources"));
const AuditLogs = lazy(() => import("@/views/AuditLogs"));
const Unauthorized = lazy(() => import("@/views/Unauthorized"));
const LlmAnalyst = lazy(() => import("@/views/LlmAnalyst/Index"));
const LLMProviders = lazy(() => import("@/views/LlmProviders/Index"));
const AudioProviders = lazy(() => import("@/views/AudioProviders/Index"));
const FineTune = lazy(() => import("@/views/FineTune/Index"));
const FineTuneJobDetail = lazy(
  () => import("@/views/FineTune/pages/FineTuneJobDetail")
);
const LocalFineTune = lazy(() => import("@/views/LocalFineTune/Index"));
const LocalFineTuneJobDetail = lazy(
  () => import("@/views/LocalFineTune/pages/LocalFineTuneJobDetail")
);
const Tools = lazy(() => import("@/views/Tools/Index"));
const CreateTool = lazy(() => import("@/views/Tools/pages/CreateTool"));
const KnowledgeBase = lazy(() => import("@/views/KnowledgeBase/Index"));
const KnowledgeBaseForm = lazy(
  () => import("@/views/KnowledgeBase/pages/KnowledgeBaseForm")
);
const MLModels = lazy(() => import("@/views/MLModels/Index"));
const MLModelDetail = lazy(
  () => import("@/views/MLModels/components/MLModelDetail")
);
const FeatureFlagsPage = lazy(() =>
  import("./views/Settings/pages/FeatureFlags").then((m) => ({
    default: m.FeatureFlags,
  }))
);
const Translations = lazy(() =>
  import("./views/Settings/pages/Translations").then((m) => ({
    default: m.Translations,
  }))
);
const Languages = lazy(() =>
  import("./views/Settings/pages/Languages").then((m) => ({
    default: m.Languages,
  }))
);
const FileManagerFiles = lazy(() =>
  import("./views/Settings/pages/FileManagerFiles").then((m) => ({
    default: m.FileManagerFiles,
  }))
);
const NotificationsSettings = lazy(() =>
  import("./views/Settings/pages/Notifications").then((m) => ({
    default: m.NotificationsSettings,
  }))
);
const GmailOAuthCallback = lazy(() =>
  import("./views/DataSources/components/GmailOAuthCallback").then((m) => ({
    default: m.GmailOAuthCallback,
  }))
);
const Office365OAuthCallback = lazy(() =>
  import("./views/DataSources/components/Office365OAuthCallback").then((m) => ({
    default: m.Office365OAuthCallback,
  }))
);
const WebhookListPage = lazy(() => import("@/views/Webhooks/pages/Webhooks"));
const HelpCenterIndex = lazy(() => import("@/views/HelpCenter/Index"));
const NewTicketPage = lazy(() => import("@/views/HelpCenter/pages/NewTicket"));
const TicketDetailPage = lazy(
  () => import("@/views/HelpCenter/pages/TicketDetail")
);
const MCPServersPage = lazy(() => import("@/views/MCPServers/pages/MCPServers"));
const TestSuitesIndex = lazy(() => import("@/views/TestSuites/Index"));
const DatasetsPage = lazy(() => import("@/views/TestSuites/pages/DatasetsPage"));
const EvaluationsPage = lazy(
  () => import("@/views/TestSuites/pages/EvaluationsPage")
);
const DatasetDetailPage = lazy(
  () => import("@/views/TestSuites/pages/DatasetDetailPage")
);
const EvaluationDetailPage = lazy(
  () => import("@/views/TestSuites/pages/EvaluationDetailPage")
);
const Privacy = lazy(() => import("@/views/Privacy"));
const Onboarding = lazy(() => import("@/views/Onboarding/pages/Onboarding"));

const RouteFallback = () => (
  <div className="min-h-screen flex items-center justify-center text-[#6b7280]">
    Loading...
  </div>
);

/** Wrap a route element in a Suspense boundary for lazy-loaded pages. */
const withSuspense = (node: ReactNode) => (
  <Suspense fallback={<RouteFallback />}>{node}</Suspense>
);

const getAccessToken = () => storage.getAccessToken() ?? "";

const ProtectedLayout = () => {
  const { status, isOffline } = useServerStatus();
  const isDown = isOffline || status.down;

  return (
    <ProtectedRoute>
      <WebSocketDashboardProvider token={getAccessToken()}>
        {isDown ? (
          <ServerDownPage />
        ) : (
          <>
            <Suspense fallback={<RouteFallback />}>
              <Outlet />
            </Suspense>
            <GlobalChat />
          </>
        )}
      </WebSocketDashboardProvider>
    </ProtectedRoute>
  );
};

export type RegistrationStatus = "loading" | "new" | "existing";

export const RoutesProvider = () => {
  const showLocalFineTune = useFeatureFlagVisible(
    FeatureFlagKeys.LLM_SETTINGS.SHOW_LOCAL_FINE_TUNE
  );

  const [registrationStatus, setRegistrationStatus] = useState<RegistrationStatus>("loading");
  const [skipOnboarding, setSkipOnboarding] = useState(false);

  const checkRegistration = useCallback(async () => {
    try {
      const response = await getRegistrationStatus();
      const isNew = Boolean(response?.is_new);
      setRegistrationStatus(isNew ? "new" : "existing");
    } catch (error) {
      setRegistrationStatus("existing");
    }
  }, [setRegistrationStatus]);

  useEffect(() => {
    // check if the user has skipped onboarding
    const skipFlag = storage.shouldSkipOnboarding();
    if (skipFlag) {
      setSkipOnboarding(true);
      setRegistrationStatus("existing");
      return;
    }

    // check the registration status
    checkRegistration();
  }, [checkRegistration]);

  // temporary skip handler
  useEffect(() => {
    const handleSkip = () => setRegistrationStatus("existing");
    window.addEventListener("skip-onboarding", handleSkip);
    return () => window.removeEventListener("skip-onboarding", handleSkip);
  }, []);

  const mainRouter = useMemo(
    () =>
      createBrowserRouter([
        {
          path: "/",
          element: <ProtectedLayout />,
          children: [
            { path: "", element: <Navigate to="/dashboard" replace /> },
            { path: "dashboard", element: <Index /> },
            {
              path: "transcripts",
              element: (
                <ProtectedRoute requiredPermissions={["read:conversation"]}>
                  <Transcripts />
                </ProtectedRoute>
              ),
            },
            {
              path: "operators",
              element: (
                <ProtectedRoute requiredPermissions={["read:operator"]}>
                  <Operators />
                </ProtectedRoute>
              ),
            },
            {
              path: "analytics/ai-insights",
              element: (
                <ProtectedRoute requiredPermissions={["read:llm_analyst"]}>
                  <Analytics />
                </ProtectedRoute>
              ),
            },
            {
              path: "analytics/agent-performance",
              element: (
                <ProtectedRoute requiredPermissions={["read:dashboard"]}>
                  <AgentPerformancePage />
                </ProtectedRoute>
              ),
            },
            {
              path: "analytics/node-analytics",
              element: (
                <ProtectedRoute requiredPermissions={["read:dashboard"]}>
                  <NodeAnalyticsPage />
                </ProtectedRoute>
              ),
            },
            {
              path: "reported-feedback",
              element: (
                <ProtectedRoute requiredPermissions={["read:conversation"]}>
                  <ReportedFeedback />
                </ProtectedRoute>
              ),
            },
            {
              path: "notifications",
              element: <Notifications />,
            },
            {
              path: "settings",
              element: <Settings />,
            },
            {
              path: "settings/feature-flags",
              element: (
                <ProtectedRoute requiredPermissions={["read:feature_flag"]}>
                  <FeatureFlagsPage />
                </ProtectedRoute>
              ),
            },
            {
              path: "settings/translations",
              element: (
                <ProtectedRoute requiredPermissions={["read:app_setting"]}>
                  <Translations />
                </ProtectedRoute>
              ),
            },
            {
              path: "settings/languages",
              element: (
                <ProtectedRoute requiredPermissions={["read:app_setting"]}>
                  <Languages />
                </ProtectedRoute>
              ),
            },
            {
              path: "settings/file-manager",
              element: (
                <ProtectedRoute requiredPermissions={["read:file"]}>
                  <FileManagerFiles />
                </ProtectedRoute>
              ),
            },
            {
              path: "settings/notifications",
              element: <NotificationsSettings />,
            },
            {
              path: "users",
              element: (
                <ProtectedRoute requiredPermissions={["read:user"]}>
                  <Users />
                </ProtectedRoute>
              ),
            },
            {
              path: "roles",
              element: (
                <ProtectedRoute requiredPermissions={["read:role"]}>
                  <Roles />
                </ProtectedRoute>
              ),
            },
            {
              path: "user-groups",
              element: (
                <ProtectedRoute requiredPermissions={["read:user_group"]}>
                  <UserGroups />
                </ProtectedRoute>
              ),
            },
            {
              path: "admin/gdpr-conversations",
              element: (
                <ProtectedRoute requiredPermissions={["delete:conversation:gdpr"]}>
                  <GdprConversations />
                </ProtectedRoute>
              ),
            },
            {
              path: "llm-analyst",
              element: (
                <ProtectedRoute requiredPermissions={["read:llm_analyst"]}>
                  <LlmAnalyst />
                </ProtectedRoute>
              ),
            },
            {
              path: "llm-providers",
              element: (
                <ProtectedRoute requiredPermissions={["read:llm_provider"]}>
                  <LLMProviders />
                </ProtectedRoute>
              ),
            },
            {
              path: "audio-providers",
              element: (
                <ProtectedRoute requiredPermissions={["read:llm_provider"]}>
                  <AudioProviders />
                </ProtectedRoute>
              ),
            },
            {
              path: "fine-tune",
              element: (
                <ProtectedRoute requiredPermissions={["*", "update:llm_provider"]}>
                  <FineTune />
                </ProtectedRoute>
              ),
            },
            {
              path: "fine-tune/:id",
              element: (
                <ProtectedRoute requiredPermissions={["*", "update:llm_provider"]}>
                  <FineTuneJobDetail />
                </ProtectedRoute>
              ),
            },
            {
              path: "local-fine-tune",
              element: (
                showLocalFineTune ? (
                  <ProtectedRoute requiredPermissions={["*", "update:llm_provider"]}>
                    <LocalFineTune />
                  </ProtectedRoute>
                ) : (
                  <Navigate to="/dashboard" replace />
                )
              ),
            },
            {
              path: "local-fine-tune/:id",
              element: (
                showLocalFineTune ? (
                  <ProtectedRoute requiredPermissions={["*", "update:llm_provider"]}>
                    <LocalFineTuneJobDetail />
                  </ProtectedRoute>
                ) : (
                  <Navigate to="/dashboard" replace />
                )
              ),
            },
            {
              path: "user-types",
              element: (
                <ProtectedRoute requiredPermissions={["read:user_type"]}>
                  <UserTypes />
                </ProtectedRoute>
              ),
            },
            {
              path: "api-keys",
              element: (
                <ProtectedRoute requiredPermissions={["read:api_key"]}>
                  <ApiKeys />
                </ProtectedRoute>
              ),
            },
            {
              path: "ai-agents",
              element: (
                <ProtectedRoute requiredPermissions={["read:llm_analyst"]}>
                  <AIAgents />
                </ProtectedRoute>
              ),
            },
            {
              path: "ai-agents/*",
              element: (
                <ProtectedRoute requiredPermissions={["read:llm_analyst"]}>
                  <AIAgents />
                </ProtectedRoute>
              ),
            },
            {
              path: "tools",
              element: (
                <ProtectedRoute requiredPermissions={["*", "update:app_settings"]}>
                  <Tools />
                </ProtectedRoute>
              ),
            },
            {
              path: "tools/create",
              element: (
                <ProtectedRoute requiredPermissions={["*", "update:app_settings"]}>
                  <CreateTool />
                </ProtectedRoute>
              ),
            },
            {
              path: "tools/edit/:id",
              element: (
                <ProtectedRoute requiredPermissions={["*", "update:app_settings"]}>
                  <CreateTool />
                </ProtectedRoute>
              ),
            },
            {
              path: "data-sources",
              element: (
                <ProtectedRoute requiredPermissions={["read:data_source"]}>
                  <DataSources />
                </ProtectedRoute>
              ),
            },
            {
              path: "audit-logs",
              element: (
                <ProtectedRoute requiredPermissions={["read:audit_log"]}>
                  <AuditLogs />
                </ProtectedRoute>
              ),
            },
            {
              path: "knowledge-base",
              element: (
                <ProtectedRoute requiredPermissions={["*", "update:knowledge_base"]}>
                  <KnowledgeBase />
                </ProtectedRoute>
              ),
            },
            {
              path: "knowledge-base/new",
              element: (
                <ProtectedRoute requiredPermissions={["*", "update:knowledge_base"]}>
                  <KnowledgeBaseForm />
                </ProtectedRoute>
              ),
            },
            {
              path: "knowledge-base/edit/:id",
              element: (
                <ProtectedRoute requiredPermissions={["*", "update:knowledge_base"]}>
                  <KnowledgeBaseForm />
                </ProtectedRoute>
              ),
            },
            {
              path: "ml-models",
              element: (
                <ProtectedRoute requiredPermissions={["*", "update:ml_model"]}>
                  <MLModels />
                </ProtectedRoute>
              ),
            },
            {
              path: "ml-models/:id",
              element: (
                <ProtectedRoute requiredPermissions={["*", "update:ml_model"]}>
                  <MLModelDetail />
                </ProtectedRoute>
              ),
            },
            {
              path: "tests",
              element: (
                <ProtectedRoute requiredPermissions={["test:workflow"]}>
                  <TestSuitesIndex />
                </ProtectedRoute>
              ),
            },
            {
              path: "tests/datasets",
              element: (
                <ProtectedRoute requiredPermissions={["test:workflow"]}>
                  <DatasetsPage />
                </ProtectedRoute>
              ),
            },
            {
              path: "tests/datasets/:datasetId",
              element: (
                <ProtectedRoute requiredPermissions={["test:workflow"]}>
                  <DatasetDetailPage />
                </ProtectedRoute>
              ),
            },
            {
              path: "tests/evaluations",
              element: (
                <ProtectedRoute requiredPermissions={["test:workflow"]}>
                  <EvaluationsPage />
                </ProtectedRoute>
              ),
            },
            {
              path: "tests/evaluations/:evaluationId",
              element: (
                <ProtectedRoute requiredPermissions={["test:workflow"]}>
                  <EvaluationDetailPage />
                </ProtectedRoute>
              ),
            },
            {
              path: "app-settings",
              element: (
                <ProtectedRoute requiredPermissions={["read:app_setting"]}>
                  <AppSettings />
                </ProtectedRoute>
              ),
            },
            {
              path: "webhooks",
              element: (
                <ProtectedRoute requiredPermissions={["read:webhook"]}>
                  <WebhookListPage />
                </ProtectedRoute>
              ),
            },
            {
              path: "help-center",
              element: <HelpCenterIndex />,
            },
            {
              path: "help-center/new",
              element: <NewTicketPage />,
            },
            {
              path: "help-center/:ticketId",
              element: <TicketDetailPage />,
            },
            {
              path: "mcp-servers",
              element: (
                <ProtectedRoute requiredPermissions={["read:mcp_server"]}>
                  <MCPServersPage />
                </ProtectedRoute>
              ),
            },

            { path: "change-password", element: <ChangePassword /> },
            {
              path: "gauth/callback",
              element: <GmailOAuthCallback />,
            },
          ],
        },
        { path: "login", element: withSuspense(<><ServerStatusBanner /><Login /></>) },
        { path: "login/sso-callback", element: withSuspense(<><ServerStatusBanner /><LoginSsoCallback /></>) },
        { path: "register", element: withSuspense(<Register />) },
        { path: "privacy", element: withSuspense(<Privacy />) },
        {
              path: "onboarding",
              element: withSuspense(<Onboarding />),
            },
        { path: "unauthorized", element: withSuspense(<Unauthorized />) },
        { path: "office365/oauth/callback", element: withSuspense(<Office365OAuthCallback />)},
        { path: "*", element: withSuspense(<NotFound />) }
      ]),
    [showLocalFineTune],
  );

  const organizationRouter = useMemo(
    () =>
      createBrowserRouter([
        { path: "onboarding", element: withSuspense(<Onboarding />) },
        { path: "*", element: <Navigate to="/onboarding" replace /> },
      ]),
    [],
  );

  if (registrationStatus === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center text-[#6b7280]">
        Loading...
      </div>
    );
  }

  const router = registrationStatus === "new" ? organizationRouter : mainRouter;

  return <RoutesContext.Provider value={{ registrationStatus, skipOnboarding }}>
    <RouterProvider router={router} />
  </RoutesContext.Provider>;
};
