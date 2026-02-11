# 🚀 IPA 生成器部署指南

本项目允许用户通过网页界面自定义生成 iOS IPA 文件，无需 Mac 电脑。

## 📁 项目结构

```
HTML2IPA-main/
├── .github/workflows/build.yml  # GitHub Actions 构建脚本
├── backend/                      # Render 后端 API
│   ├── package.json
│   ├── server.js
│   └── .env.example
├── frontend/                     # 前端静态网站
│   ├── index.html
│   ├── style.css
│   └── script.js
└── iOSWKWebViewAppTemplateCookiesWorkLikeACharm/  # iOS 项目源码
```

## 🛠️ 部署步骤

### 第一步：推送代码到 GitHub

**⚠️ 重要：你必须先把本地代码推送到你的 GitHub 仓库！**

在项目根目录执行以下命令：

```bash
# 1. 初始化 Git（如果还没有）
git init

# 2. 添加远程仓库（替换为你的仓库地址）
git remote add origin https://github.com/你的用户名/你的仓库名.git

# 3. 添加所有文件
git add .

# 4. 提交
git commit -m "Add frontend and backend for IPA generator"

# 5. 推送到 GitHub
git push -u origin main
```

如果你是 Fork 的项目，确保你已经把 Fork 克隆到本地，然后推送修改：
```bash
git add .
git commit -m "Add frontend and backend"
git push origin main
```

### 第二步：创建 GitHub Personal Access Token

1. 打开 [GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens](https://github.com/settings/tokens?type=beta)
2. 点击 "Generate new token"
3. 设置以下权限：
   - **Repository access**: 选择你 Fork 的仓库
   - **Permissions**:
     - `Actions`: Read and Write
     - `Contents`: Read
4. 生成并**保存** Token（只显示一次！）

### 第三步：部署到 Render（前后端合并为一个服务）

> ⚠️ **重要变更**：现在前后端合并部署为一个 Web Service，不再需要分开部署！
> 这样可以避免 CORS 问题、API 地址配置错误、以及前后端存活状态不同步的问题。

1. 登录 [Render Dashboard](https://dashboard.render.com/)
2. 点击 **New → Web Service**
3. 连接你的 GitHub 仓库
4. 配置：
   - **Name**: `ipa-builder`（或任意名称）
   - **Root Directory**: `backend`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. 添加环境变量：
   | Key | Value |
   |-----|-------|
   | `GITHUB_TOKEN` | 你的 GitHub Token |
   | `REPO_OWNER` | 你的 GitHub 用户名 |
   | `REPO_NAME` | 你的仓库名（如 `HTML2IPA-main`） |
6. 点击 **Create Web Service**
7. 等待部署完成

### 🎉 完成！

直接访问你的 Render 服务 URL（如 `https://ipa-builder.onrender.com`），前端页面和 API 都在同一个服务上。

> 📝 **注意**：不需要再单独部署前端 Static Site，也不需要修改 `script.js` 中的 API 地址。
> 后端服务器会自动提供 `frontend/` 目录下的静态文件。

> ⚠️ **如果你之前分开部署了前端和后端**，请在 Render Dashboard 删除旧的 Static Site 和旧的 Web Service，然后重新创建一个 Web Service 即可。

---

## 📖 使用流程

1. 用户打开网页
2. 填写：应用名称、网页链接、上传图标
3. 点击"生成 IPA"
4. 等待 2-3 分钟（GitHub Actions 编译）
5. 下载生成的 IPA 文件
6. 使用 [AltStore](https://altstore.io/) 或 [Sideloadly](https://sideloadly.io/) 签名安装

---

## ⚠️ 注意事项

1. **GitHub Actions 免费额度**：公开仓库完全免费，私有仓库每月 2000 分钟
2. **Render 免费层**：后端每月 750 小时免费，静态网站完全免费
3. **IPA 签名**：生成的 IPA 未签名，需要用户自行使用工具签名
4. **图标尺寸**：建议上传 1024x1024 正方形 PNG 图片

---

## 🔧 故障排查

### 构建失败
- 检查 GitHub Actions 日志
- 确认仓库中的 iOS 项目文件完整

### API 请求失败
- 检查 Render 环境变量是否正确
- 确认 GitHub Token 权限足够

### 下载失败
- GitHub Artifacts 有效期为 7 天
- 检查 Token 是否过期

---

## 📝 技术栈

- **前端**: 原生 HTML/CSS/JavaScript
- **后端**: Node.js + Express
- **构建**: GitHub Actions (macOS runner)
- **托管**: Render (免费层)