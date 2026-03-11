/**
 * Frontend API Client
 * 
 * Usage:
 *   import { api } from '@/lib/modules/client/api';
 *   
 *   const { data, error } = await api.get('/api/messages');
 *   if (error) { toast.error(error); return; }
 *   // use data
 */

export type ApiResponse<T> =
  | { data: T; error?: never }
  | { data?: never; error: string };

class ApiClient {
  private baseUrl = '';

  /**
   * Core request method - handles all HTTP methods
   */
  private async request<T>(
    url: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      const res = await fetch(this.baseUrl + url, {
        ...options,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      // Handle error responses
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return { error: body.error || `Request failed: ${res.status}` };
      }

      // Handle 204 No Content
      if (res.status === 204) {
        return { data: null as T };
      }

      const data = await res.json();
      return { data };
    } catch (err) {
      console.error('[API Client]', err);
      return { error: 'Network error - please try again' };
    }
  }

  /**
   * GET request
   */
  get<T>(url: string): Promise<ApiResponse<T>> {
    return this.request<T>(url, { method: 'GET' });
  }

  /**
   * POST request with JSON body
   */
  post<T>(url: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(url, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * PATCH request with JSON body
   */
  patch<T>(url: string, body: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(url, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  /**
   * PUT request with JSON body
   */
  put<T>(url: string, body: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(url, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  /**
   * DELETE request
   */
  delete<T>(url: string): Promise<ApiResponse<T>> {
    return this.request<T>(url, { method: 'DELETE' });
  }

  /**
   * Upload file(s) via FormData
   * Note: Don't set Content-Type header - browser will set it with boundary
   */
  async upload<T>(url: string, formData: FormData): Promise<ApiResponse<T>> {
    try {
      const res = await fetch(this.baseUrl + url, {
        method: 'POST',
        credentials: 'include',
        body: formData,
        // No Content-Type header - let browser set multipart boundary
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return { error: body.error || `Upload failed: ${res.status}` };
      }

      const data = await res.json();
      return { data };
    } catch (err) {
      console.error('[API Client Upload]', err);
      return { error: 'Upload failed - please try again' };
    }
  }
}

// Export singleton instance
export const api = new ApiClient();

// Also export the class for testing/extension
export { ApiClient };
