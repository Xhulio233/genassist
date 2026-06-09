import { Toaster } from "react-hot-toast";
import { RoutesProvider } from "./Routes";
import { UserSessionProvider } from "@/context/UserSessionContext";
import { FeatureFlagProvider } from "@/context/FeatureFlagContext";
import { ServerStatusProvider } from "@/context/ServerStatusContext";

export default function App() {
  return (
    <ServerStatusProvider>
      <Toaster position="top-right" reverseOrder={false} />
      <UserSessionProvider>
        <FeatureFlagProvider>
          <RoutesProvider />
        </FeatureFlagProvider>
      </UserSessionProvider>
    </ServerStatusProvider>
  );
}
