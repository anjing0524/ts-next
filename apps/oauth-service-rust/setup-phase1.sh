#!/bin/bash
# Phase 1: 基础设施自动化设置脚本
# 此脚本自动化完成 Phase 1 的目录和文件创建

set -e

echo "🚀 Phase 1: OAuth Service Web UI 基础设施设置"
echo "================================================"
echo ""

# 获取脚本所在目录
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "📁 Step 1: 创建目录结构..."
mkdir -p templates
mkdir -p static/styles
mkdir -p static/assets
echo "✅ 目录创建完成"
echo ""

echo "📝 Step 2: 创建 Tailwind 配置文件..."
cat > tailwind.config.js << 'EOF'
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./templates/**/*.html",
    "./src/**/*.rs",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#EFF6FF',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
        },
        secondary: {
          50: '#FEF2F2',
          500: '#EF4444',
          600: '#DC2626',
          700: '#B91C1C',
        },
        accent: {
          50: '#FAF5FF',
          500: '#8B5CF6',
          600: '#7C3AED',
          700: '#6D28D9',
        },
      },
    },
  },
  plugins: [],
};
EOF
echo "✅ tailwind.config.js 创建完成"
echo ""

echo "🎨 Step 3: 创建 Tailwind CSS 输入文件..."
cat > static/styles/tailwind.css << 'EOF'
@tailwind base;
@tailwind components;
@tailwind utilities;

/* 自定义组件 */
@layer components {
  .btn-primary {
    @apply px-4 py-2 rounded-lg font-medium
           bg-blue-600 text-white
           hover:bg-blue-700 active:bg-blue-800
           transition-colors duration-200
           disabled:opacity-50 disabled:cursor-not-allowed;
  }

  .btn-secondary {
    @apply px-4 py-2 rounded-lg font-medium
           bg-gray-200 text-gray-900
           hover:bg-gray-300 active:bg-gray-400
           transition-colors duration-200;
  }

  .input-field {
    @apply w-full px-4 py-2 rounded-lg
           border border-gray-300
           focus:border-blue-500 focus:ring-2 focus:ring-blue-200
           transition-colors duration-200;
  }

  .card {
    @apply bg-white rounded-lg shadow-md
           border border-gray-200
           p-6 space-y-4;
  }
}

/* 深色模式支持 */
@media (prefers-color-scheme: dark) {
  .card {
    @apply bg-slate-800 border-slate-700;
  }

  .input-field {
    @apply bg-slate-700 border-slate-600 text-white;
  }
}
EOF
echo "✅ tailwind.css 创建完成"
echo ""

echo "📄 Step 4: 创建基础布局模板..."
cat > templates/layout.html << 'EOF'
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{% block title %}OAuth 授权系统{% endblock %}</title>

    <!-- Tailwind CSS (CDN) -->
    <script src="https://cdn.tailwindcss.com"></script>

    <!-- HTMX -->
    <script src="https://unpkg.com/htmx.org@1.9.10"></script>

    <!-- 自定义样式 -->
    <link rel="stylesheet" href="/static/styles/tailwind.css">

    <style>
        :root {
            --color-primary: #3B82F6;
            --color-secondary: #EF4444;
            --color-accent: #8B5CF6;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        }

        @media (prefers-color-scheme: dark) {
            :root {
                color-scheme: dark;
            }
        }
    </style>

    {% block extra_head %}{% endblock %}
</head>
<body class="bg-white dark:bg-slate-900 text-gray-900 dark:text-white">

    <nav class="bg-white dark:bg-slate-800 shadow">
        <div class="container mx-auto px-4 py-4">
            <div class="flex items-center justify-between">
                <h1 class="text-xl font-bold text-blue-600">OAuth 授权系统</h1>
            </div>
        </div>
    </nav>

    <main class="container mx-auto px-4 py-8">
        {% block content %}{% endblock %}
    </main>

    <footer class="mt-12 py-6 border-t border-gray-200 dark:border-gray-700 text-center text-gray-600 dark:text-gray-400">
        <p>&copy; 2025 OAuth 授权系统. All rights reserved.</p>
    </footer>

    {% block extra_script %}{% endblock %}
</body>
</html>
EOF
echo "✅ layout.html 创建完成"
echo ""

echo "📝 Step 5: 创建页面模板占位符..."

# login.html
cat > templates/login.html << 'EOF'
{% extends "layout.html" %}

{% block title %}登录 - OAuth 授权系统{% endblock %}

{% block content %}
<div class="flex items-center justify-center min-h-[600px]">
    <div class="w-full max-w-md">
        <h1 class="text-3xl font-bold mb-8">{{ company_name }}</h1>

        {% if let Some(error) = error_message %}
        <div class="mb-4 p-4 rounded-lg bg-red-50 border border-red-200">
            <p class="text-red-700">{{ error }}</p>
        </div>
        {% endif %}

        <p class="text-gray-600 mb-4">登录表单将在这里显示</p>
        <p class="text-sm text-gray-500">Redirect URL: {{ redirect_url }}</p>
    </div>
</div>
{% endblock %}
EOF

# consent.html
cat > templates/consent.html << 'EOF'
{% extends "layout.html" %}

{% block title %}权限授权 - OAuth 授权系统{% endblock %}

{% block content %}
<div class="flex items-center justify-center min-h-[600px]">
    <div class="w-full max-w-lg">
        <h1 class="text-3xl font-bold mb-8">权限授权请求</h1>

        <div class="card">
            <p class="text-lg font-semibold">{{ client_name }}</p>
            <p class="text-gray-600">申请访问你的信息</p>

            <p class="mt-4 text-sm text-gray-600">当前用户: <strong>{{ user_email }}</strong></p>

            <p class="mt-4 text-sm text-gray-500">权限同意表单将在这里显示</p>
        </div>
    </div>
</div>
{% endblock %}
EOF

# error.html
cat > templates/error.html << 'EOF'
{% extends "layout.html" %}

{% block title %}错误 - OAuth 授权系统{% endblock %}

{% block content %}
<div class="flex items-center justify-center min-h-[600px]">
    <div class="w-full max-w-md card">
        <h1 class="text-2xl font-bold text-red-600 mb-4">{{ error_code }}</h1>
        <p class="text-gray-700">{{ error_message }}</p>
        <a href="/login" class="mt-4 inline-block text-blue-600 hover:underline">
            返回登录
        </a>
    </div>
</div>
{% endblock %}
EOF

# success.html
cat > templates/success.html << 'EOF'
{% extends "layout.html" %}

{% block title %}成功 - OAuth 授权系统{% endblock %}

{% block content %}
<div class="flex items-center justify-center min-h-[600px]">
    <div class="w-full max-w-md card">
        <h1 class="text-2xl font-bold text-green-600 mb-4">✓ 成功</h1>
        <p class="text-gray-700">{{ message }}</p>
    </div>
</div>
{% endblock %}
EOF

echo "✅ 所有页面模板创建完成"
echo ""

echo "📦 Step 6: 检查 Cargo.toml 依赖..."
if grep -q "askama" Cargo.toml; then
    echo "✅ askama 依赖已存在"
else
    echo "⚠️ askama 依赖未找到，需要手动添加到 Cargo.toml"
fi
echo ""

echo "🏗️ Step 7: 验证项目结构..."
echo "目录结构:"
find . -maxdepth 3 -type d | grep -E "(templates|static)" | sort
echo ""

echo "文件列表:"
ls -la templates/ 2>/dev/null || echo "⚠️ templates 目录未找到"
ls -la static/styles/ 2>/dev/null || echo "⚠️ static/styles 目录未找到"
echo ""

echo "✅ Phase 1 基础设施设置完成!"
echo ""
echo "📋 下一步:"
echo "1. 运行 cargo build 验证编译"
echo "2. 检查 Cargo.toml 中是否有所有需要的依赖"
echo "3. 根据 PHASE_1_DETAILED_BREAKDOWN_2025-12-01.md 进行后续步骤"
echo ""
echo "💡 开发建议:"
echo "Terminal 1: cargo watch -q -c -w src -x run"
echo "Terminal 2: tailwindcss -i static/styles/tailwind.css -o static/styles/main.css --watch"
echo "Terminal 3: open http://localhost:3001/login"
echo ""
