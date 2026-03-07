import axios, { AxiosError, AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { createBrowserClient } from "./supabase";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Create a configured Axios instance with:
 * - Base URL from environment
 * - Request interceptor: attaches Supabase JWT token
 * - Response interceptor: handles 401 (redirect to login) and 500 (error toast)
 */
const createApiClient = (): AxiosInstance => {
  const client = axios.create({
    baseURL: API_BASE_URL,
    headers: {
      "Content-Type": "application/json",
    },
    timeout: 30000,
  });

  // Request interceptor: attach Supabase JWT
  client.interceptors.request.use(
    async (config: InternalAxiosRequestConfig) => {
      try {
        const supabase = createBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.access_token) {
          config.headers.set("Authorization", `Bearer ${session.access_token}`);
        }
      } catch (error) {
        console.error("Failed to attach auth token:", error);
      }
      return config;
    },
    (error: AxiosError) => Promise.reject(error)
  );

  // Response interceptor: handle errors globally
  client.interceptors.response.use(
    (response: AxiosResponse) => response,
    async (error: AxiosError) => {
      const status = error.response?.status;

      if (status === 401) {
        // Token expired or invalid — redirect to login
        if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
      } else if (status === 403) {
        console.error("Access forbidden:", error.response?.data);
      } else if (status === 500) {
        console.error("Server error:", error.response?.data);
      } else if (error.code === "ECONNABORTED" || error.code === "ERR_NETWORK") {
        console.error("Network error — check if backend is running.");
      }

      return Promise.reject(error);
    }
  );

  return client;
};

const apiClient = createApiClient();

export interface ApiResponse<T = unknown> {
  data: T;
  error: string | null;
}

/**
 * Typed GET request
 */
export async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const response = await apiClient.get<T>(url, { params });
  return response.data;
}

/**
 * Typed POST request
 */
export async function post<T>(url: string, data?: unknown): Promise<T> {
  const response = await apiClient.post<T>(url, data);
  return response.data;
}

/**
 * Typed PUT request
 */
export async function put<T>(url: string, data?: unknown): Promise<T> {
  const response = await apiClient.put<T>(url, data);
  return response.data;
}

/**
 * Typed PATCH request
 */
export async function patch<T>(url: string, data?: unknown): Promise<T> {
  const response = await apiClient.patch<T>(url, data);
  return response.data;
}

/**
 * Typed DELETE request
 */
export async function del<T>(url: string): Promise<T> {
  const response = await apiClient.delete<T>(url);
  return response.data;
}

/**
 * Upload file with multipart/form-data
 */
export async function upload<T>(url: string, formData: FormData, onProgress?: (percent: number) => void): Promise<T> {
  const response = await apiClient.post<T>(url, formData, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onProgress(percent);
      }
    },
  });
  return response.data;
}

export default apiClient;
