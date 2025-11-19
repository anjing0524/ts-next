# 国际化 (i18n) 实施指南

## 当前状态

### 已完成 ✅

1. **安装依赖**
   - `next-intl@^4.5.3` 已安装

2. **翻译文件**
   - `messages/zh-CN.json` - 简体中文翻译 (200+ 键值对)
   - `messages/en-US.json` - 英文翻译 (200+ 键值对)

3. **配置文件**
   - `i18n.ts` - 国际化配置
   - `lib/i18n/navigation.ts` - 导航助手
   - `lib/i18n/locale-provider.tsx` - 语言上下文提供者

4. **组件**
   - `components/i18n/LanguageSwitcher.tsx` - 语言切换器

### 覆盖的翻译类别

- ✅ **common** - 通用词汇 (保存、取消、确认等)
- ✅ **navigation** - 导航菜单
- ✅ **auth** - 认证相关
- ✅ **users** - 用户管理
- ✅ **roles** - 角色管理
- ✅ **permissions** - 权限管理
- ✅ **table** - 表格通用
- ✅ **form** - 表单验证
- ✅ **dialog** - 对话框
- ✅ **error** - 错误消息
- ✅ **settings** - 设置
- ✅ **language** - 语言设置

---

## 待完成任务

### Phase 1: App 结构改造 (2-3 天)

#### 1.1 创建语言路由结构

当前结构：
```
app/
  (dashboard)/
    admin/
      ...
  (auth)/
    login/
      ...
```

需要改造为（使用 next-intl 推荐结构）：
```
app/
  [locale]/
    (dashboard)/
      admin/
        ...
    (auth)/
      login/
        ...
```

**步骤**：
1. 创建 `app/[locale]` 目录
2. 将现有 route groups 移动到 `app/[locale]/` 下
3. 更新所有内部链接使用语言前缀

**文件修改**：
- 移动所有 app routes 到 `app/[locale]/`
- 更新 `proxy.ts` 处理语言路由

#### 1.2 创建 layout.tsx

```typescript
// app/[locale]/layout.tsx
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { locales } from '@/i18n';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  // Validate locale
  if (!locales.includes(locale as any)) {
    notFound();
  }

  // Load messages
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

---

### Phase 2: 组件国际化 (3-5 天)

#### 2.1 更新用户管理组件

**文件**: `features/users/components/UserManagementView.tsx`

```typescript
import { useTranslations } from 'next-intl';

export function UserManagementView() {
  const t = useTranslations('users');

  return (
    <div>
      <h2>{t('title')}</h2>
      {hasPermission('users:create') && (
        <Button onClick={openCreateModal}>
          <PlusCircle className="mr-2 h-4 w-4" />
          {t('createUser')}
        </Button>
      )}
      {/* ... */}
    </div>
  );
}
```

**需要更新的组件**：
- ✅ UserManagementView
- ✅ UserFormDialog
- ✅ UserTableColumns
- ⏸️ RoleManagementView
- ⏸️ RoleFormDialog
- ⏸️ PermissionManagementView
- ⏸️ SettingsView
- ⏸️ LoginPage

#### 2.2 更新表单验证消息

**文件**: `features/users/domain/user.ts`

```typescript
import { z } from 'zod';

// 需要创建自定义错误映射
const customErrorMap: z.ZodErrorMap = (issue, ctx) => {
  if (issue.code === z.ZodIssueCode.too_small) {
    if (issue.minimum === 1) {
      return { message: t('form.requiredField') };
    }
    return { message: t('form.minLength', { min: issue.minimum }) };
  }
  // ... 其他错误
  return { message: ctx.defaultError };
};

z.setErrorMap(customErrorMap);
```

---

### Phase 3: 导航和链接 (1-2 天)

#### 3.1 更新所有链接

**Before**:
```typescript
import Link from 'next/link';

<Link href="/admin/users">用户管理</Link>
```

**After**:
```typescript
import { Link } from '@/lib/i18n/navigation';

<Link href="/admin/users">{t('navigation.users')}</Link>
```

#### 3.2 更新路由跳转

**Before**:
```typescript
import { useRouter } from 'next/navigation';

const router = useRouter();
router.push('/admin/users');
```

**After**:
```typescript
import { useRouter } from '@/lib/i18n/navigation';

const router = useRouter();
router.push('/admin/users'); // 自动添加语言前缀
```

---

### Phase 4: 语言切换器集成 (1 天)

#### 4.1 添加到导航栏

```typescript
// components/layout/Header.tsx
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';

export function Header() {
  return (
    <header>
      {/* ... */}
      <LanguageSwitcher />
    </header>
  );
}
```

#### 4.2 添加到设置页面

```typescript
// app/[locale]/(dashboard)/admin/settings/page.tsx
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';

export default function SettingsPage() {
  return (
    <div>
      <h2>{t('settings.language')}</h2>
      <LanguageSwitcher />
    </div>
  );
}
```

---

### Phase 5: 日期和数字格式化 (1 天)

#### 5.1 日期格式化

```typescript
import { useFormatter } from 'next-intl';

export function UserRow({ user }: { user: User }) {
  const format = useFormatter();

  return (
    <tr>
      <td>{user.username}</td>
      <td>{format.dateTime(user.createdAt, {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })}</td>
    </tr>
  );
}
```

#### 5.2 数字格式化

```typescript
const format = useFormatter();

// 货币
format.number(1234.56, { style: 'currency', currency: 'USD' });

// 百分比
format.number(0.56, { style: 'percent' });

// 带千位分隔符
format.number(1234567);
```

---

### Phase 6: 测试 (1-2 天)

#### 6.1 单元测试

```typescript
// __tests__/i18n/translations.test.ts
import { describe, it, expect } from '@jest/globals';
import zhCN from '@/messages/zh-CN.json';
import enUS from '@/messages/en-US.json';

describe('Translations', () => {
  it('should have the same keys for all locales', () => {
    const zhKeys = Object.keys(zhCN);
    const enKeys = Object.keys(enUS);

    expect(zhKeys).toEqual(enKeys);
  });

  it('should not have empty values', () => {
    Object.values(zhCN).forEach((value) => {
      expect(value).not.toBe('');
    });
  });
});
```

#### 6.2 E2E 测试

```typescript
// tests/e2e/i18n.spec.ts
test('should switch language', async ({ page }) => {
  await page.goto('/zh-CN/admin');

  // 验证默认语言
  await expect(page.getByText('用户管理')).toBeVisible();

  // 切换到英文
  await page.getByRole('button', { name: /简体中文|语言/i }).click();
  await page.getByRole('menuitem', { name: 'English' }).click();

  // 验证语言切换成功
  await expect(page.getByText('User Management')).toBeVisible();
});
```

---

## 实施优先级

### High Priority (必须完成)

1. ✅ 翻译文件创建
2. ✅ 配置文件创建
3. ⏸️ App 结构改造
4. ⏸️ 核心组件国际化 (用户管理、角色管理、登录)

### Medium Priority (推荐完成)

5. ⏸️ 导航和链接更新
6. ⏸️ 表单验证消息国际化
7. ⏸️ 日期和数字格式化

### Low Priority (可选)

8. ⏸️ 错误消息国际化
9. ⏸️ Toast 通知国际化
10. ⏸️ 文档和注释国际化

---

## 工作量估算

| 任务 | 预计时间 | 难度 |
|------|---------|------|
| **Phase 1: App 结构改造** | 2-3 天 | 高 |
| **Phase 2: 组件国际化** | 3-5 天 | 中 |
| **Phase 3: 导航和链接** | 1-2 天 | 低 |
| **Phase 4: 语言切换器** | 1 天 | 低 |
| **Phase 5: 格式化** | 1 天 | 中 |
| **Phase 6: 测试** | 1-2 天 | 中 |
| **总计** | **9-14 天** | - |

---

## 常见问题

### Q1: 如何处理动态内容？

**A**: 使用 ICU 消息格式：

```json
{
  "users": {
    "greeting": "Hello, {username}!",
    "count": "You have {count, plural, =0 {no users} =1 {one user} other {# users}}"
  }
}
```

```typescript
t('users.greeting', { username: 'John' });
t('users.count', { count: 5 }); // "You have 5 users"
```

### Q2: 如何处理富文本？

**A**: 使用 `t.rich()`:

```json
{
  "users": {
    "description": "Click <link>here</link> to view all users"
  }
}
```

```typescript
t.rich('users.description', {
  link: (chunks) => <Link href="/admin/users">{chunks}</Link>
});
```

### Q3: 如何处理服务器端组件？

**A**: 使用 `getTranslations` 服务器函数：

```typescript
import { getTranslations } from 'next-intl/server';

export default async function Page() {
  const t = await getTranslations('users');

  return <h1>{t('title')}</h1>;
}
```

### Q4: 如何处理 URL 本地化？

**A**: 配置路径名映射：

```typescript
// navigation.ts
export const { Link, redirect, usePathname, useRouter } =
  createSharedPathnamesNavigation({
    locales,
    pathnames: {
      '/': '/',
      '/admin/users': {
        'zh-CN': '/admin/用户',
        'en-US': '/admin/users'
      }
    }
  });
```

---

## 最佳实践

### 1. 翻译键命名

✅ **好的命名**:
```json
{
  "users.title": "用户管理",
  "users.createUser": "添加用户",
  "users.deleteSuccess": "用户删除成功"
}
```

❌ **不好的命名**:
```json
{
  "title1": "用户管理",
  "btn": "添加",
  "msg": "成功"
}
```

### 2. 翻译组织

✅ **按功能模块组织**:
```
messages/
  zh-CN/
    common.json
    users.json
    roles.json
    auth.json
```

❌ **单一大文件**:
```
messages/
  zh-CN.json  (1000+ lines)
```

### 3. 默认值

✅ **总是提供默认值**:
```typescript
t('users.title', { default: '用户管理' })
```

### 4. 类型安全

创建类型定义：
```typescript
// types/i18n.ts
import messages from '@/messages/zh-CN.json';

type Messages = typeof messages;

declare global {
  interface IntlMessages extends Messages {}
}
```

---

## 参考资源

- [next-intl 官方文档](https://next-intl-docs.vercel.app/)
- [ICU 消息格式](https://unicode-org.github.io/icu/userguide/format_parse/messages/)
- [Next.js 国际化](https://nextjs.org/docs/app/building-your-application/routing/internationalization)

---

## 当前进度

### 已完成 (20%)
- ✅ 依赖安装
- ✅ 翻译文件 (zh-CN, en-US)
- ✅ 配置文件
- ✅ 语言切换器组件

### 待完成 (80%)
- ⏸️ App 结构改造
- ⏸️ 组件国际化
- ⏸️ 导航更新
- ⏸️ 测试

**建议**: 由于国际化是一个大规模重构任务，建议：
1. 先完成单元测试任务（更紧急）
2. 安排专门的国际化 Sprint (1-2 周)
3. 分阶段实施（先核心功能，再扩展功能）

---

**文档版本**: 1.0
**创建日期**: 2024-11-18
**维护者**: Development Team
