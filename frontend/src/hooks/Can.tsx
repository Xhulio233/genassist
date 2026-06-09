import React, { ReactNode } from "react";
import { usePermissions } from "../context/UserSessionContext";

interface CanProps {
  permissions: string[];
  children: ReactNode;
}

const Can: React.FC<CanProps> = ({ permissions, children }) => {
  const userPermissions = usePermissions();

  const hasPermission = permissions.every((permission) =>
    userPermissions.includes(permission)
  );

  return hasPermission ? <>{children}</> : null;
};

export default Can;
