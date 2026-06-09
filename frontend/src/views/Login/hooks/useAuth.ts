import { useState } from "react";
import {
  login as loginApi,
  isAuthenticated as isAuthenticatedFn,
  logout as logoutService,
} from "@/services/auth";
import { AxiosError } from "axios";

interface LoginResponse {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  force_upd_pass_date?: string;
  error_key?: string;
}

export const useAuth = () => {
  // Authentication is derived from the session token (presence + validity +
  // refresh capability), never from a localStorage flag.
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(
    isAuthenticatedFn()
  );

  const login = async (
    username: string,
    password: string,
    tenant?: string
  ): Promise<LoginResponse | null> => {
    try {
      const response = await loginApi({ username, password }, tenant);

      if (response?.access_token) {
        setIsAuthenticated(true);
      }

      return response;
    } catch (error) {
      if (error instanceof AxiosError && error.response) {
        const errorData = error.response.data;
        return errorData;
      } else {
        return null;
      }
    }
  };

  const logout = () => {
    logoutService();
    setIsAuthenticated(false);
  };

  const checkAuth = (): boolean => isAuthenticatedFn();

  return {
    isAuthenticated,
    login,
    logout,
    checkAuth,
  };
};
