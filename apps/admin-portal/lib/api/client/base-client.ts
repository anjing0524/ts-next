/**
 * 基础HTTP客户端
 * 提供最基本的HTTP请求功能，不包含任何装饰器逻辑
 */

import type { HttpClient, HttpRequestOptions, HttpResponse } from './types';
import { HttpError, NetworkError, TimeoutError } from './types';

export class BaseHttpClient implements HttpClient {
  protected readonly baseUrl: string;
  protected readonly defaultTimeout: number = 30000; // 30秒默认超时

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:6188/api/v2';
  }

  /**
   * 发送HTTP请求
   */
  async request<T = any>(url: string, options: HttpRequestOptions = {}): Promise<HttpResponse<T>> {
    const fullUrl = this.buildUrl(url, options.params);
    const requestOptions = this.prepareRequestOptions(options);
    const startTime = Date.now();

    try {
      const response = await this.fetchWithTimeout(fullUrl, requestOptions, options.timeout || this.defaultTimeout);
      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        throw await this.createHttpError(response, responseTime);
      }

      const data = await this.parseResponse<T>(response);

      return {
        data,
        status: response.status,
        headers: response.headers,
        timestamp: startTime,
      };
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }
      throw this.createNetworkError(error, startTime);
    }
  }

  /**
   * GET请求
   */
  async get<T = any>(url: string, options: HttpRequestOptions = {}): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...options, method: 'GET' });
  }

  /**
   * POST请求
   */
  async post<T = any>(url: string, data?: any, options: HttpRequestOptions = {}): Promise<HttpResponse<T>> {
    return this.request<T>(url, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * PUT请求
   */
  async put<T = any>(url: string, data?: any, options: HttpRequestOptions = {}): Promise<HttpResponse<T>> {
    return this.request<T>(url, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * DELETE请求
   */
  async delete<T = any>(url: string, options: HttpRequestOptions = {}): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...options, method: 'DELETE' });
  }

  /**
   * PATCH请求
   */
  async patch<T = any>(url: string, data?: any, options: HttpRequestOptions = {}): Promise<HttpResponse<T>> {
    return this.request<T>(url, {
      ...options,
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * 文件上传
   */
  async upload<T = any>(url: string, file: File, options: HttpRequestOptions = {}): Promise<HttpResponse<T>> {
    const formData = new FormData();
    formData.append('file', file);

    return this.request<T>(url, {
      ...options,
      method: 'POST',
      body: formData,
      headers: {
        ...options.headers,
        // 让浏览器自动设置Content-Type为multipart/form-data
      },
    });
  }

  /**
   * 构建完整URL
   */
  protected buildUrl(url: string, params?: Record<string, any>): string {
    const baseUrl = this.baseUrl.endsWith('/') ? this.baseUrl.slice(0, -1) : this.baseUrl;
    const path = url.startsWith('/') ? url : `/${url}`;
    const fullUrl = `${baseUrl}${path}`;

    if (!params) {
      return fullUrl;
    }

    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          value.forEach(item => searchParams.append(`${key}[]`, String(item)));
        } else {
          searchParams.append(key, String(value));
        }
      }
    });

    const queryString = searchParams.toString();
    return queryString ? `${fullUrl}?${queryString}` : fullUrl;
  }

  /**
   * 准备请求选项
   */
  protected prepareRequestOptions(options: HttpRequestOptions): RequestInit {
    const headers = new Headers(options.headers || {});

    // 设置默认Content-Type
    if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
      headers.set('Content-Type', 'application/json');
    }

    // 添加安全头
    headers.set('X-Requested-With', 'XMLHttpRequest');
    headers.set('X-Content-Type-Options', 'nosniff');

    return {
      method: options.method || 'GET',
      headers,
      body: options.body,
      credentials: options.credentials || 'same-origin',
      mode: options.mode || 'same-origin',
      cache: options.cache,
      redirect: options.redirect,
      referrer: options.referrer,
      referrerPolicy: options.referrerPolicy,
      integrity: options.integrity,
      keepalive: options.keepalive,
      signal: options.signal,
    };
  }

  /**
   * 带超时的fetch请求
   */
  protected async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeout: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new TimeoutError(`Request timeout after ${timeout}ms`);
      }
      throw error;
    }
  }

  /**
   * 解析响应
   */
  protected async parseResponse<T>(response: Response): Promise<T> {
    const contentType = response.headers.get('content-type');

    if (contentType?.includes('application/json')) {
      return response.json();
    }

    if (contentType?.includes('text/')) {
      return response.text() as any;
    }

    if (contentType?.includes('multipart/form-data')) {
      return response.formData() as any;
    }

    return response.blob() as any;
  }

  /**
   * 创建HTTP错误
   */
  protected async createHttpError(response: Response, responseTime: number): Promise<HttpError> {
    let errorData: any;
    let errorMessage: string;

    try {
      errorData = await response.json();
      errorMessage = errorData.message || errorData.error || `HTTP ${response.status}`;
    } catch {
      errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      errorData = { status: response.status, message: errorMessage };
    }

    return new HttpError(
      response.status,
      errorData.code || `HTTP_${response.status}`,
      errorMessage,
      {
        ...errorData,
        responseTime,
        url: response.url,
        headers: Object.fromEntries(response.headers.entries()),
      }
    );
  }

  /**
   * 创建网络错误
   */
  protected createNetworkError(error: any, startTime: number): NetworkError {
    const responseTime = Date.now() - startTime;

    if (error instanceof TypeError) {
      return new NetworkError(`Network error: ${error.message}`);
    }

    return new NetworkError(`Unknown network error: ${error?.message || String(error)}`);
  }
}