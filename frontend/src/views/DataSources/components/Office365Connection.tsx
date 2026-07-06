// Office365Connection.tsx
import { useEffect, useState } from "react";
import { Button } from "@/components/button";
import { Alert, AlertDescription } from "@/components/alert";
import { Badge } from "@/components/badge";
import { Label } from "@/components/label";
import { Mail, AlertCircle, CheckCircle, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "react-hot-toast";
import { Checkbox } from "@/components/checkbox";
import {
  createTempOffice365DataSource,
  buildOffice365OAuthUrl,
  inferOffice365Capabilities,
  OFFICE365_ADMIN_CONSENT_CAPABILITIES,
  type Office365Capability,
} from "@/services/dataSources";
import { DataSource } from "@/interfaces/dataSource.interface";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/select";
import { AppSetting } from "@/interfaces/app-setting.interface";
import { getAllAppSettings } from "@/services/appSettings";
import { CreateNewSelectItem } from "@/components/CreateNewSelectItem";
import { AppSettingDialog } from "@/views/AppSettings/components/AppSettingDialog";

interface Office365ConnectionProps {
  dataSource?: DataSource;
  dataSourceName: string;
  onDataSourceCreated?: (id: string) => void;
}

// The access this connection grants. Only SharePoint pulls in an admin-consent-required
// scope (Sites.Read.All), so selecting only the others keeps the connection self-service.
const CAPABILITY_OPTIONS: {
  id: Office365Capability;
  label: string;
  description: string;
}[] = [
  { id: "teams", label: "Teams messaging", description: "Post messages to Teams channels" },
  { id: "calendar", label: "Calendar", description: "Create and read calendar events" },
  { id: "mail", label: "Mail", description: "Read and send email" },
  {
    id: "sharepoint",
    label: "SharePoint files",
    description: "Read SharePoint sites and files (requires admin approval)",
  },
];

const DEFAULT_CAPABILITIES: Office365Capability[] = ["teams", "calendar", "mail"];

export function Office365Connection({
  dataSource,
  dataSourceName,
  onDataSourceCreated,
}: Office365ConnectionProps) {
  const [appSettingsId, setAppSettingsId] = useState(
    (dataSource?.connection_data.app_settings_id as string) || ""
  );
  const [appSettings, setAppSettings] = useState<AppSetting[]>([]);
  const [isLoadingAppSettings, setIsLoadingAppSettings] = useState(false);
  const [isCreateSettingOpen, setIsCreateSettingOpen] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [capabilities, setCapabilities] = useState<Office365Capability[]>(() => {
    const existing = inferOffice365Capabilities(
      dataSource?.connection_data.scope as string | undefined
    );
    return existing.length ? existing : DEFAULT_CAPABILITIES;
  });

  const requiresAdminConsent = capabilities.some((c) =>
    OFFICE365_ADMIN_CONSENT_CAPABILITIES.includes(c)
  );

  const toggleCapability = (id: Office365Capability) =>
    setCapabilities((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );

  const isConnected = dataSource?.connection_data.user_email;
  const isPending = dataSource?.oauth_status === "pending";
  const hasError = dataSource?.oauth_status === "error";

  const fetchAppSettings = async () => {
    setIsLoadingAppSettings(true);
    try {
      const settings = await getAllAppSettings();
      const filteredSettings = settings.filter((setting) => {
        const settingTypeLower = setting.type.toLowerCase();
        return settingTypeLower === "microsoft" && setting.is_active === 1;
      });
      setAppSettings(filteredSettings);
    } catch (error) {
      console.error("Error fetching app settings:", error);
    } finally {
      setIsLoadingAppSettings(false);
    }
  };

  useEffect(() => {
    setAppSettingsId(
      (dataSource?.connection_data.app_settings_id as string) || ""
    );

    const existing = inferOffice365Capabilities(
      dataSource?.connection_data.scope as string | undefined
    );
    setCapabilities(existing.length ? existing : DEFAULT_CAPABILITIES);

    fetchAppSettings();
  }, [dataSource]);

  const handleConnect = async () => {
    if (!dataSourceName.trim()) {
      toast.error("Data source name is required.");
      return;
    }

    if (!appSettingsId) {
      toast.error("Configuration variables are required.");
      return;
    }

    if (capabilities.length === 0) {
      toast.error("Select at least one access type to grant.");
      return;
    }

    setIsConnecting(true);
    try {
      const selectedAppSettings = appSettings.find(
        (setting) => setting.id === appSettingsId
      );
      const clientId = selectedAppSettings?.values?.microsoft_client_id as string | undefined;
      const tenantId = selectedAppSettings?.values?.microsoft_tenant_id as string | undefined;
      let datasourceId = dataSource?.id;

      if (!datasourceId) {
        datasourceId = await createTempOffice365DataSource(
          dataSourceName,
          appSettingsId
        );
        onDataSourceCreated?.(datasourceId);
      }

      const oauthUrl = buildOffice365OAuthUrl(
        clientId,
        tenantId,
        datasourceId,
        capabilities
      );
      window.location.href = oauthUrl;
    } catch (error) {
      toast.error("Failed to initiate Office 365 connection.");
    } finally {
      setIsConnecting(false);
    }
  };

  const getStatusBadge = () => {
    if (isConnected) {
      return (
        <Badge variant="success">
          <CheckCircle className="w-3 h-3 mr-1" /> Connected
        </Badge>
      );
    }
    if (isPending) {
      return (
        <Badge variant="secondary">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Pending
        </Badge>
      );
    }
    if (hasError) {
      return (
        <Badge variant="destructive">
          <AlertCircle className="w-3 h-3 mr-1" /> Error
        </Badge>
      );
    }
    return (
      <Badge variant="outline">
        <AlertCircle className="w-3 h-3 mr-1" /> Not Connected
      </Badge>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mail className="w-5 h-5 text-blue-600" />
          <span className="font-medium">Office365 Connection</span>
        </div>
        {getStatusBadge()}
      </div>

      {isConnected && dataSource?.connection_data?.user_email && (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>
            Connected to Office365 account:{" "}
            <strong>{dataSource.connection_data.user_email}</strong>
          </AlertDescription>
        </Alert>
      )}

      {!isConnected && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {hasError
              ? "Please reauthorize Office365 access before saving."
              : "Please authorize Office365 access before saving."}
          </AlertDescription>
        </Alert>
      )}

      {/* Configuration Vars */}
      <div className="space-y-1">
        <Label htmlFor="config_vars">
          Configuration Vars <span className="text-red-500">*</span>
        </Label>
        <Select
          value={appSettingsId || ""}
          onValueChange={(value) => {
            if (value === "__create__") {
              setIsCreateSettingOpen(true);
            } else {
              setAppSettingsId(value);
            }
          }}
          disabled={isLoadingAppSettings}
        >
          <SelectTrigger id="config_vars">
            <SelectValue placeholder="Select configuration vars" />
          </SelectTrigger>
          <SelectContent>
            {appSettings.map((setting) => (
              <SelectItem key={setting.id} value={setting.id}>
                {setting.name}
              </SelectItem>
            ))}
            <CreateNewSelectItem />
          </SelectContent>
        </Select>
      </div>

      {/* Access selection — request only the scopes needed so the connection stays
          self-service unless SharePoint (admin-consent-required) is included. */}
      <div className="space-y-2">
        <Label>
          Access <span className="text-red-500">*</span>
        </Label>
        <div className="space-y-2">
          {CAPABILITY_OPTIONS.map((option) => (
            <label
              key={option.id}
              htmlFor={`o365-cap-${option.id}`}
              className="flex items-start gap-2 cursor-pointer"
            >
              <Checkbox
                id={`o365-cap-${option.id}`}
                checked={capabilities.includes(option.id)}
                onCheckedChange={() => toggleCapability(option.id)}
                className="mt-0.5"
              />
              <div className="leading-tight">
                <div className="text-sm font-medium">{option.label}</div>
                <div className="text-xs text-muted-foreground">
                  {option.description}
                </div>
              </div>
            </label>
          ))}
        </div>
        {requiresAdminConsent && (
          <Alert>
            <ShieldAlert className="h-4 w-4" />
            <AlertDescription>
              SharePoint access requires Microsoft admin approval. A tenant
              administrator may need to grant consent before this connection works.
            </AlertDescription>
          </Alert>
        )}
      </div>

      <Button
        type="button"
        onClick={handleConnect}
        disabled={isConnecting}
        variant={isConnected ? "outline" : "default"}
        className="w-full"
      >
        {isConnecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        <Mail className="mr-2 h-4 w-4" />
        {isConnected ? "Reauthorize Office365" : "Connect Office365"}
      </Button>

      <AppSettingDialog
        isOpen={isCreateSettingOpen}
        onOpenChange={setIsCreateSettingOpen}
        mode="create"
        initialType="Microsoft"
        disableTypeSelect
        onSettingSaved={async (created) => {
          if (created) {
            await fetchAppSettings();
            setTimeout(() => {
              setAppSettingsId(created.id);
            }, 0);
          }
        }}
      />
    </div>
  );
}
