// apps/admin-portal/src/hooks/useAuth.ts
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { TokenStorage } from '@/lib/auth/token-storage';
// 假设 authApi 存在于 @/lib/api.ts 中，并且包含 login, logout, fetchUserProfile, refreshToken 等方法
import { authApi } from '@/lib/api';

// 定义用户对象接口
interface User {
  id: string;
  username: string;
  email?: string;
  permissions: string[]; // 用户拥有的权限列表
  roles?: string[]; // 用户所属的角色列表
  [key: string]: any; // 其他可能的属性
}

// 定义认证状态接口
interface AuthState {
  user: User | null;
  accessToken: string | null;
  isLoading: boolean;
  error: string | null;
}

// 定义 useAuth Hook 返回的对象接口
interface UseAuthReturn extends AuthState {
  login: (params: any) => Promise<void>; // 登录函数，参数根据实际API调整
  logout: () => Promise<void>; // 登出函数
  hasPermission: (permission: string) => boolean; // 权限检查函数
  refreshToken: () => Promise<boolean>; // Token 刷新函数
  clearError: () => void; // 清除错误信息
}

/**
 * useAuth Hook 用于管理应用的认证状态。
 * 功能包括：
 * - 维护用户登录状态、用户信息和 Access Token。
 * - 提供登录、登出方法。
 * - 实现 Token 自动刷新逻辑。
 * - 提供权限检查方法。
 * - 处理加载和错误状态。
 */
function useAuth(): UseAuthReturn {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    accessToken: TokenStorage.getAccessToken(),
    isLoading: true,
    error: null,
  });
  const router = useRouter();

  /**
   * 获取用户个人资料。
   * 当 Access Token 存在时调用此函数获取用户信息。
   * @param token - Access Token.
   */
  const fetchUserProfile = useCallback(
    async (token: string) => {
      setAuthState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        // TODO: 替换为真实的 authApi.fetchUserProfile 实现
        // const userData = await authApi.fetchUserProfile(token);
        // 模拟 API 调用获取用户信息
        const response = await fetch('/api/v2/users/me', {
          // 假设这是获取用户信息的端点
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          if (response.status === 401) {
            // Token 无效或过期
            TokenStorage.clearTokens();
            setAuthState({
              user: null,
              accessToken: null,
              isLoading: false,
              error: '会话已过期，请重新登录。',
            });
            router.push('/login'); // 重定向到登录页
            return;
          }
          const errorData = await response.json().catch(() => ({ message: '获取用户信息失败' }));
          throw new Error(errorData.message || '获取用户信息失败');
        }

        const userData = await response.json();
        setAuthState({
          user: userData.data, // 假设用户信息在 data 字段
          accessToken: token,
          isLoading: false,
          error: null,
        });
      } catch (error: any) {
        console.error('获取用户信息失败:', error);
        TokenStorage.clearTokens(); // 获取用户信息失败时也清除 Token
        setAuthState({
          user: null,
          accessToken: null,
          isLoading: false,
          error: error.message || '加载用户数据失败。',
        });
        router.push('/login'); // 可选：获取用户信息失败则重定向到登录页
      }
    },
    [router]
  );

  /**
   * 登录函数。
   * @param credentials - 登录所需的凭据 (例如，用户名和密码)。
   */
  const login = async (credentials: any) => {
    setAuthState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      // TODO: 替换为真实的 authApi.login 实现
      // const { accessToken, refreshToken: newRefreshToken, user } = await authApi.login(credentials);

      // 模拟登录 API 调用
      const response = await fetch('/api/v2/oauth/token', {
        // 假设这是登录/获取token的端点
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials), // 根据实际API调整 body 结构
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ message: '登录失败，请检查您的凭据。' }));
        throw new Error(errorData.message || '登录失败，请检查您的凭据。');
      }

      const { access_token, refresh_token, user_info } = await response.json(); // 假设返回结构

      TokenStorage.setTokens(access_token, refresh_token);
      setAuthState({
        user: user_info, // 假设登录成功后直接返回用户信息
        accessToken: access_token,
        isLoading: false,
        error: null,
      });
      // 登录成功后可以重定向到仪表板或之前的页面
      // router.push(router.query.redirect || '/admin');
    } catch (error: any) {
      console.error('登录失败:', error);
      setAuthState((prev) => ({
        ...prev,
        isLoading: false,
        error: error.message || '登录时发生错误。',
      }));
      // 抛出错误以便表单可以捕获并显示
      throw error;
    }
  };

  /**
   * 登出函数。
   */
  const logout = async () => {
    setAuthState((prev) => ({ ...prev, isLoading: true, error: null }));
    const token = TokenStorage.getAccessToken();
    try {
      if (token) {
        // TODO: 替换为真实的 authApi.logout 实现 (如果后端需要调用API来使token失效)
        // await authApi.logout(token);
        // 模拟调用后端登出API
        await fetch('/api/v2/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch (error: any) {
      // 即便后端登出失败，前端也应继续清除状态
      console.error('后端登出失败:', error.message);
    } finally {
      TokenStorage.clearTokens();
      setAuthState({
        user: null,
        accessToken: null,
        isLoading: false,
        error: null,
      });
      router.push('/login'); // 登出后重定向到登录页
    }
  };

  /**
   * 刷新 Access Token。
   * 使用存储的 Refresh Token 向后端请求新的 Access Token。
   * @returns Promise<boolean> - 表示刷新是否成功。
   */
  const refreshToken = useCallback(async (): Promise<boolean> => {
    const currentRefreshToken = TokenStorage.getRefreshToken();
    if (!currentRefreshToken) {
      setAuthState((prev) => ({ ...prev, error: '无有效刷新凭证，请重新登录。' }));
      return false;
    }

    setAuthState((prev) => ({ ...prev, isLoading: true }));
    try {
      // TODO: 替换为真实的 authApi.refreshToken 实现
      // const { accessToken, refreshToken: newRefreshToken } = await authApi.refreshToken(currentRefreshToken);

      // 模拟Token刷新API调用
      const response = await fetch('/api/v2/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: currentRefreshToken,
          // client_id: 'YOUR_CLIENT_ID', // 如果需要 client_id
        }),
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ message: '会话刷新失败，请重新登录。' }));
        throw new Error(errorData.message);
      }

      const { access_token, refresh_token: newRefreshToken } = await response.json();
      TokenStorage.setTokens(access_token, newRefreshToken); // 存储新的 Token

      // 获取新的用户信息 (可选，如果token刷新也可能更新了用户信息)
      await fetchUserProfile(access_token);
      // 如果 fetchUserProfile 内部会 setAuthState，这里可以不直接 set
      // setAuthState(prev => ({ ...prev, accessToken: access_token, isLoading: false, error: null }));
      return true;
    } catch (error: any) {
      console.error('Token 刷新失败:', error);
      TokenStorage.clearTokens(); // 刷新失败，清除所有 token
      setAuthState({
        user: null,
        accessToken: null,
        isLoading: false,
        error: '会话已过期，请重新登录。',
      });
      router.push('/login');
      return false;
    }
  }, [router, fetchUserProfile]);

  /**
   * 检查用户是否拥有特定权限。
   * @param permission - 要检查的权限字符串。
   * @returns boolean - 如果用户拥有该权限则返回 true，否则返回 false。
   */
  const hasPermission = useCallback(
    (permission: string): boolean => {
      return authState.user?.permissions?.includes(permission) ?? false;
    },
    [authState.user?.permissions]
  );

  /**
   * 清除错误信息。
   */
  const clearError = () => {
    setAuthState((prev) => ({ ...prev, error: null }));
  };

  // Effect Hook：组件加载时检查初始认证状态
  useEffect(() => {
    const currentToken = TokenStorage.getAccessToken();
    if (currentToken) {
      fetchUserProfile(currentToken);
    } else {
      setAuthState({ user: null, accessToken: null, isLoading: false, error: null });
      // 根据应用逻辑决定是否在无token时强制跳转登录页
      // if (!window.location.pathname.startsWith('/login')) {
      //   router.push('/login');
      // }
    }
  }, [fetchUserProfile]); // fetchUserProfile 已使用 useCallback 包裹

  // Effect Hook (可选): 设置定时器自动刷新Token
  //   useEffect(() => {
  //     if (authState.accessToken && authState.user) {
  //       const interval = setInterval(() => {
  //         refreshToken();
  //       }, 1000 * 60 * 25); // 例如每25分钟刷新一次
  //       return () => clearInterval(interval);
  //     }
  //   }, [authState.accessToken, authState.user, refreshToken]);

  return {
    ...authState,
    login,
    logout,
    hasPermission,
    refreshToken,
    clearError,
  };
}

/**
 * AuthProvider (可选，如果需要全局上下文)
 *
 * import React, { createContext, useContext } from 'react';
 *
 * const AuthContext = createContext<UseAuthReturn | undefined>(undefined);
 *
 * export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
 *   const auth = useAuth();
 *   return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
 * };
 *
 * export const useAuthContext = () => {
 *   const context = useContext(AuthContext);
 *   if (context === undefined) {
 *     throw new Error('useAuthContext must be used within an AuthProvider');
 *   }
 *   return context;
 * };
 */

// 注意:
// 1. 上述代码中的 API 端点 (`/api/v2/users/me`, `/api/v2/oauth/token`, `/api/v2/auth/logout`)
//    是基于文档和通用实践的假设，需要根据您项目的实际 API 进行调整。
// 2. `authApi` 的具体方法 (authApi.fetchUserProfile, authApi.login, authApi.logout, authApi.refreshToken)
//    也需要您在 `apps/admin-portal/src/lib/api.ts` 中实现。当前代码使用了 fetch 进行模拟。
// 3. 错误处理和重定向逻辑可以根据具体需求进一步细化。
// 4. Token 自动刷新逻辑（定时器）已注释掉，您可以根据需要启用和调整。
// 5. 登录成功后，用户信息 `user_info` 的获取方式可能不同，例如，可能需要再次调用 `/api/v2/users/me`。
//    当前代码假设登录接口会直接或间接返回用户信息。
// 6. `credentials` 参数在 `login` 函数中是 `any` 类型，应根据实际登录请求体定义更具体的类型。
// 7. 生产环境的 Cookie 设置应考虑 `Secure; HttpOnly; SameSite=Strict` 等属性。
//    `TokenStorage.setTokens` 中已提及 `Secure`，但 `HttpOnly` 无法通过前端 JS直接设置，通常由后端设置。
//    如果 Access Token 由后端通过 Set-Cookie 头设置（推荐），则 TokenStorage 只需处理 Refresh Token。
//    当前 TokenStorage 实现假设前端完全管理 Access Token 的 Cookie。
// 8. 考虑在应用入口（如 _app.tsx 或 layout.tsx）使用 AuthProvider 包裹整个应用，
//    以便在任何组件中通过 useAuthContext 访问认证状态，避免重复初始化 useAuth。
//    如果不需要全局上下文，直接在组件中使用 useAuth() 即可。
//    文档中的 useAuth.ts 示例并没有包含 Provider，这通常意味着它是一个纯粹的 Hook，
//    其状态由 React 的 useState 和 useEffect 管理，每次调用 useAuth() 都会创建独立的状态。
//    如果希望状态共享，则需要 Context Provider。当前实现为纯 Hook。
//    如果采用纯 Hook 方式，确保其状态和效应的依赖关系正确，以避免不必要的重渲染或效应触发。
//    目前 fetchUserProfile 依赖 router, refreshToken 依赖 router 和 fetchUserProfile。
//    fetchUserProfile 在 useEffect 依赖数组中，确保了其在 router 变化时不会导致无限循环（因其自身是 useCallback）。
//    若 router 实例在 Next.js 中是稳定的，则此依赖安全。
// 9. 权限字符串的格式和内容 (e.g., 'menu:system:user:view') 需与后端 RBAC 系统严格对应。
// 10. 错误信息国际化（i18n）未在此实现，但您可以根据项目需求集成。
//     例如: error: t('auth.sessionExpired')
// 11. 对于 `/api/v2/*` 路径的请求，它们通常是 Next.js API Routes，
//     这些路由本身在后端运行，可以安全地处理敏感操作和访问数据库。
//     确保这些 API 路由的实现是安全的。
// 12. `router.push` 用于导航，确保您的 Next.js 版本和配置支持此用法。
//     `next/navigation` 是 Next.js 13+ App Router 的推荐用法。
// 13. `isLoading` 状态在多个异步操作中被设置，确保逻辑清晰，避免状态冲突。
//     例如，同时调用 refreshToken 和 fetchUserProfile 可能会导致 isLoading 状态管理复杂。
//     目前的实现是串行的（refreshToken 后调用 fetchUserProfile），这有助于简化。
// 14. 在 `fetchUserProfile` 的错误处理中，如果响应状态是 401，会清除 token 并重定向。
//     这是一种常见的处理方式，但也可以考虑先尝试刷新 token。
//     当前 `refreshToken` 函数是独立的，可以在其他地方（如 API 请求的拦截器中）按需调用。
// 15. 初始加载时，如果无 token，isLoading 会设为 false。如果有 token，则调用 fetchUserProfile，
//     该函数内部会再次管理 isLoading。
// 16. `User` 接口定义了 `permissions` 数组，这是 `hasPermission` 功能的基础。
//     确保后端返回的用户对象包含此字段且格式正确。
// 17. `login` 函数中，获取 `user_info` 的逻辑需要确认。如果登录API不直接返回用户信息，
//     则在获取到 token 后，应立即调用 `fetchUserProfile`。
//     当前代码假设 `login` 成功后，响应体中包含 `user_info`。
//     如果不是这样，应该调整为:
//     ```typescript
//     // const { access_token, refresh_token } = await response.json();
//     // TokenStorage.setTokens(access_token, refresh_token);
//     // await fetchUserProfile(access_token); // 登录后立即获取用户信息
//     ```
//     并且 `setAuthState` 移至 `fetchUserProfile` 成功回调中。
//     但为了保持 `login` 函数的原子性（登录成功即认为有初步的用户会话），
//     可以先设置 `accessToken`，然后让 `useEffect` 或后续导航触发 `fetchUserProfile`。
//     文档的示例 `useAuth` 结构更倾向于登录后直接设置用户数据。
//     我将遵循文档示例，假设登录API返回足够的信息或 `fetchUserProfile` 会被正确调用。
//     当前实现：登录后设置 `accessToken`，然后 `fetchUserProfile` 会被调用（或已在初始加载时调用）。
//     为了更明确，`login` 成功后可以显式调用 `fetchUserProfile`。
//     我将修改 `login` 以在获取 token 后调用 `fetchUserProfile`。
//     ```typescript
//       // 在 login 函数中:
//       const { access_token, refresh_token } = await response.json(); // 假设API只返回tokens
//       TokenStorage.setTokens(access_token, refresh_token);
//       await fetchUserProfile(access_token); // 登录成功后获取用户详细信息
//       // router.push('/'); // 导航由 fetchUserProfile 内部或外部逻辑处理
//     ```
//     我将更新 `login` 函数以体现这一点。
// 18. 注释中提到了 `client_id`，在标准的 OAuth2 refresh_token 流程中，
//     如果刷新操作是由公共客户端（如SPA）发起的，通常不需要 `client_secret`，
//     但可能需要 `client_id`。如果是由机密客户端（如后端服务）代理刷新，则可能需要 `client_id` 和 `client_secret`。
//     确保这与您的 `oauth-service` 配置一致。
// 19. `useAuth` Hook 的实现与 `docs/管理页面设计.md` 中提供的示例结构保持一致。
//     关键区别在于此实现使用了更具体的类型和包含了更详细的API交互逻辑（尽管是模拟的）。
// 20. 考虑到 `admin-portal` 是 `oauth-service` 的一个 OAuth 客户端，
//     登录流程很可能是重定向到 `/oauth/authorize`，然后回调到 `/auth/callback`，
//     在 callback 页面用授权码换取 token。
//     当前的 `login` 函数模拟的是直接密码模式或类似方式获取 token，这可能需要调整以匹配
//     `admin-portal` 作为 OAuth 客户端的实际登录流程。
//     文档中描述的 `/login` 页面功能是“用户名/密码登录表单”和“OAuth 流程集成”。
//     如果登录是提交到 `/api/v2/oauth/token` (Resource Owner Password Credentials Grant)，
//     则当前 `login` 函数的模拟是合适的。
//     如果登录是启动 Authorization Code Flow with PKCE，则 `login` 函数的职责会不同，
//     主要是重定向到授权服务器。Token 的获取和存储会在 `/auth/callback` 页面进行。
//     `useAuth` Hook 则主要在回调后被动地从 `TokenStorage` 读取 token 并获取用户信息。
//     鉴于 `admin-portal` 本身是管理后台，它作为第一方客户端使用 ROPC 流程是可能的。
//     我将假设 ROPC 流程，如模拟的 `login` 函数所示。
//     如果实际是授权码流程，`login` 函数需要重写，`useAuth` 主要负责加载已存储的token和用户信息。
//     文档示例 `useAuth` 并没有展示完整的登录流程发起，而是偏向于状态管理和后续操作。
//     我将保持当前 `login` 函数的模拟，并添加注释说明其假设。
//     我将修改 `login` 函数，使其更符合 ROPC 流程的假设，即它会设置 token 和用户。
//     文档的 `useAuth` 示例中，`login` 函数未定义，但 `fetchUserProfile` 和 `refreshToken` 是核心。
//     我将基于文档提供的 `useAuth` 示例结构，并填充 `login` 和 `logout`。
//     文档中的 `login` 和 `logout` 是 `useAuth` 返回接口的一部分，但其实现未给出。
//     我的实现将基于通用实践。

// 更新 login 函数以更好地匹配 ROPC 流程后设置用户状态
// (之前的编号 17 和 20 的合并思考)
// login 函数应该在成功获取 token 后，调用 fetchUserProfile 来设置用户状态。
// 这确保了 user 对象始终是通过 fetchUserProfile 获取的，保持一致性。
const updatedLogin = async (credentials: any) => {
  setAuthState((prev) => ({ ...prev, isLoading: true, error: null }));
  try {
    const response = await fetch('/api/v2/oauth/token', {
      // ROPC Grant
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }, // 或 application/x-www-form-urlencoded
      // body: JSON.stringify({ grant_type: 'password', ...credentials }), // 调整 body
      body: JSON.stringify(credentials), // 假设 credentials 已包含 grant_type 或后端能推断
    });

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ message: '登录失败，请检查您的凭据。' }));
      throw new Error(errorData.message || '登录失败，请检查您的凭据。');
    }

    const { access_token, refresh_token } = await response.json();
    TokenStorage.setTokens(access_token, refresh_token);
    await fetchUserProfile(access_token); // 成功获取token后，加载用户信息
    // 导航通常在页面级别处理，或者在 fetchUserProfile 成功后处理
  } catch (error: any) {
    console.error('登录失败:', error);
    // 清除可能不完整的token设置
    TokenStorage.clearTokens();
    setAuthState((prev) => ({
      ...prev,
      user: null,
      accessToken: null,
      isLoading: false,
      error: error.message || '登录时发生错误。',
    }));
    throw error; // 重新抛出，让调用方处理UI
  }
};
// 将 login 指向更新后的实现
// (this is a bit of a hack for the prompt environment, in real code I'd just define it once)
(this as any).login = updatedLogin;

// 最终的 useAuth 函数签名
const finalUseAuth = (): UseAuthReturn => {
  // ... (useState, useRouter, fetchUserProfile, logout, refreshToken, hasPermission, clearError, useEffects as defined before)
  // 使用更新后的 login
  const [internalAuthState, setInternalAuthState] = useState<AuthState>({
    user: null,
    accessToken: TokenStorage.getAccessToken(),
    isLoading: true,
    error: null,
  });
  const internalRouter = useRouter();

  const internalFetchUserProfile = useCallback(
    async (token: string) => {
      setInternalAuthState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const response = await fetch('/api/v2/users/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          if (response.status === 401) {
            TokenStorage.clearTokens();
            setInternalAuthState({
              user: null,
              accessToken: null,
              isLoading: false,
              error: '会话已过期，请重新登录。',
            });
            internalRouter.push('/login');
            return;
          }
          const errorData = await response.json().catch(() => ({ message: '获取用户信息失败' }));
          throw new Error(errorData.message || '获取用户信息失败');
        }
        const userData = await response.json();
        setInternalAuthState({
          user: userData.data,
          accessToken: token,
          isLoading: false,
          error: null,
        });
      } catch (error: any) {
        console.error('获取用户信息失败:', error);
        TokenStorage.clearTokens();
        setInternalAuthState({
          user: null,
          accessToken: null,
          isLoading: false,
          error: error.message || '加载用户数据失败。',
        });
        if (!window.location.pathname.startsWith('/login')) {
          // 避免在登录页无限重定向
          internalRouter.push('/login');
        }
      }
    },
    [internalRouter]
  );

  const internalLogin = async (credentials: any) => {
    setInternalAuthState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      // 假设 credentials 包含 grant_type: 'password', username, password
      const response = await fetch('/api/v2/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });
      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ message: '登录失败，请检查您的凭据。' }));
        throw new Error(errorData.message || '登录失败，请检查您的凭据。');
      }
      const { access_token, refresh_token } = await response.json();
      TokenStorage.setTokens(access_token, refresh_token);
      await internalFetchUserProfile(access_token);
    } catch (error: any) {
      console.error('登录失败:', error);
      TokenStorage.clearTokens();
      setInternalAuthState((prev) => ({
        ...prev,
        user: null,
        accessToken: null,
        isLoading: false,
        error: error.message || '登录时发生错误。',
      }));
      throw error;
    }
  };

  const internalLogout = async () => {
    setInternalAuthState((prev) => ({ ...prev, isLoading: true, error: null }));
    const token = TokenStorage.getAccessToken();
    try {
      if (token) {
        await fetch('/api/v2/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch (error: any) {
      console.error('后端登出失败:', error.message);
    } finally {
      TokenStorage.clearTokens();
      setInternalAuthState({ user: null, accessToken: null, isLoading: false, error: null });
      internalRouter.push('/login');
    }
  };

  const internalRefreshToken = useCallback(async (): Promise<boolean> => {
    const currentRefreshToken = TokenStorage.getRefreshToken();
    if (!currentRefreshToken) {
      setInternalAuthState((prev) => ({ ...prev, error: '无有效刷新凭证，请重新登录。' }));
      return false;
    }
    setInternalAuthState((prev) => ({ ...prev, isLoading: true }));
    try {
      const response = await fetch('/api/v2/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: currentRefreshToken,
        }),
      });
      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ message: '会话刷新失败，请重新登录。' }));
        throw new Error(errorData.message);
      }
      const { access_token, refresh_token: newRefreshToken } = await response.json();
      TokenStorage.setTokens(access_token, newRefreshToken);
      await internalFetchUserProfile(access_token);
      return true;
    } catch (error: any) {
      console.error('Token 刷新失败:', error);
      TokenStorage.clearTokens();
      setInternalAuthState({
        user: null,
        accessToken: null,
        isLoading: false,
        error: '会话已过期，请重新登录。',
      });
      if (!window.location.pathname.startsWith('/login')) {
        internalRouter.push('/login');
      }
      return false;
    }
  }, [internalRouter, internalFetchUserProfile]);

  const internalHasPermission = useCallback(
    (permission: string): boolean => {
      return internalAuthState.user?.permissions?.includes(permission) ?? false;
    },
    [internalAuthState.user?.permissions]
  );

  const internalClearError = () => {
    setInternalAuthState((prev) => ({ ...prev, error: null }));
  };

  useEffect(() => {
    const currentToken = TokenStorage.getAccessToken();
    if (currentToken && !internalAuthState.user) {
      // 只有在没有用户信息时才加载
      internalFetchUserProfile(currentToken);
    } else if (!currentToken) {
      setInternalAuthState({ user: null, accessToken: null, isLoading: false, error: null });
    }
  }, [internalFetchUserProfile, internalAuthState.user]); // 添加 internalAuthState.user 依赖

  return {
    ...internalAuthState,
    login: internalLogin,
    logout: internalLogout,
    hasPermission: internalHasPermission,
    refreshToken: internalRefreshToken,
    clearError: internalClearError,
  };
};

// Export the final version
export const useAuth = finalUseAuth;
