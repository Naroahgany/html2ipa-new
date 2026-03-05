const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

// 中间件配置 - CORS 允许所有来源（兼容前后端分离部署的情况）
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
}));

// 显式处理 OPTIONS 预检请求
app.options('*', cors());

app.use(express.json({ limit: '50mb' }));

// 请求日志中间件
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path} - Origin: ${req.headers.origin || 'N/A'}`);
  next();
});

// ==========================================
// 提供前端静态文件（前后端合并部署的关键）
// frontend/ 目录和 backend/ 是同级的，所以路径是 ../frontend
// ==========================================
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));
console.log(`📁 静态文件目录: ${frontendPath}`);

// 环境变量
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = process.env.REPO_OWNER;
const REPO_NAME = process.env.REPO_NAME;

// 启动时检查环境变量
if (!GITHUB_TOKEN) {
  console.error('⚠️ 警告: GITHUB_TOKEN 未设置！API 将无法调用 GitHub Actions');
}
if (!REPO_OWNER) {
  console.error('⚠️ 警告: REPO_OWNER 未设置！');
}
if (!REPO_NAME) {
  console.error('⚠️ 警告: REPO_NAME 未设置！');
}

// 健康检查端点
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    config: {
      hasGithubToken: !!GITHUB_TOKEN,
      repoOwner: REPO_OWNER || '(未设置)',
      repoName: REPO_NAME || '(未设置)'
    }
  });
});

// 上传图标到 GitHub 仓库
async function uploadIconToGitHub(iconBase64, requestId) {
  const iconPath = `temp-icons/${requestId}.png`;
  
  // 检查文件是否已存在（获取 SHA）
  let sha = null;
  try {
    const checkRes = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${iconPath}`,
      {
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );
    if (checkRes.ok) {
      const checkData = await checkRes.json();
      sha = checkData.sha;
    }
  } catch (e) {
    // 文件不存在，正常情况
  }
  
  // 上传图标文件
  const uploadBody = {
    message: `Upload icon for build ${requestId}`,
    content: iconBase64,
    branch: 'main'
  };
  if (sha) {
    uploadBody.sha = sha;
  }
  
  const uploadRes = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${iconPath}`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(uploadBody)
    }
  );
  
  if (!uploadRes.ok) {
    const errorText = await uploadRes.text();
    throw new Error(`图标上传失败: ${uploadRes.status} - ${errorText}`);
  }
  
  return iconPath;
}

// 触发构建
app.post('/api/build', async (req, res) => {
  const { appName, websiteUrl, iconBase64 } = req.body;
  
  // 验证必填字段
  if (!appName || !websiteUrl || !iconBase64) {
    return res.status(400).json({
      success: false,
      error: '缺少必填字段: appName, websiteUrl, iconBase64'
    });
  }
  
  const requestId = Date.now().toString();
  
  try {
    // 第一步：上传图标到 GitHub 仓库
    console.log('正在上传图标到 GitHub...');
    const iconPath = await uploadIconToGitHub(iconBase64, requestId);
    console.log('图标上传成功:', iconPath);
    
    // 第二步：触发 GitHub Actions workflow
    const response = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/build.yml/dispatches`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ref: 'main',
          inputs: {
            app_name: appName,
            website_url: websiteUrl,
            icon_path: iconPath,
            request_id: requestId
          }
        })
      }
    );
    
    if (response.status === 204) {
      res.json({
        success: true,
        requestId,
        message: '✅ 构建已启动，请稍候...'
      });
    } else {
      const errorText = await response.text();
      throw new Error(`GitHub API 错误: ${response.status} - ${errorText}`);
    }
  } catch (error) {
    console.error('Build trigger error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 查询构建状态
app.get('/api/status/:requestId', async (req, res) => {
  const { requestId } = req.params;
  const { appName } = req.query;
  
  try {
    // 获取最近的 workflow runs
    const runsRes = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/runs?per_page=20`,
      {
        headers: { 
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );
    
    if (!runsRes.ok) {
      throw new Error('无法获取构建状态');
    }
    
    const runsData = await runsRes.json();
    
    // 检查每个 run
    for (const run of runsData.workflow_runs) {
      // 查找匹配的 artifacts
      const artifactsRes = await fetch(run.artifacts_url, {
        headers: { 
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      
      if (!artifactsRes.ok) continue;
      
      const artifactsData = await artifactsRes.json();
      
      // 查找包含 requestId 的 artifact（格式：ipa_{requestId}）
      const artifact = artifactsData.artifacts.find(a =>
        a.name === `ipa_${requestId}` || a.name.includes(requestId)
      );
      
      if (artifact) {
        if (run.status === 'completed' && run.conclusion === 'success') {
          return res.json({
            status: 'completed',
            downloadUrl: artifact.archive_download_url,
            artifactId: artifact.id,
            artifactName: artifact.name
          });
        } else if (run.status === 'in_progress' || run.status === 'queued') {
          return res.json({
            status: 'building',
            message: '正在编译中...'
          });
        } else if (run.conclusion === 'failure') {
          return res.json({
            status: 'failed',
            message: '构建失败，请检查参数后重试'
          });
        }
      }
    }
    
    // 没找到匹配的 artifact，可能还在排队或刚启动
    res.json({ 
      status: 'building',
      message: '构建排队中...'
    });
    
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ 
      status: 'error',
      error: error.message 
    });
  }
});

// 代理下载 (GitHub artifact 需要认证)
app.get('/api/download/:artifactId', async (req, res) => {
  const { artifactId } = req.params;
  
  try {
    const downloadUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/artifacts/${artifactId}/zip`;
    
    const response = await fetch(downloadUrl, {
      headers: { 
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      },
      redirect: 'follow'
    });
    
    if (!response.ok) {
      throw new Error('下载失败');
    }
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename=app.ipa.zip');
    
    // 流式传输响应
    const reader = response.body.getReader();
    const pump = async () => {
      const { done, value } = await reader.read();
      if (done) {
        res.end();
        return;
      }
      res.write(Buffer.from(value));
      return pump();
    };
    
    await pump();
    
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: '下载失败: ' + error.message });
  }
});

// 全局错误处理
app.use((err, req, res, next) => {
  console.error('未捕获的错误:', err);
  res.status(500).json({
    success: false,
    error: '服务器内部错误: ' + err.message
  });
});

// 对于非 API 路径，返回前端 index.html（支持前端路由）
app.get('*', (req, res) => {
  // 如果是 API 路径但没匹配到，返回 404 JSON
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      error: '接口不存在',
      path: req.path,
      availableEndpoints: ['/api/health', '/api/build', '/api/status/:requestId', '/api/download/:artifactId']
    });
  }
  // 否则返回前端页面
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 IPA Builder API 运行在端口 ${PORT}`);
  console.log(`📦 GitHub 仓库: ${REPO_OWNER || '(未设置)'}/${REPO_NAME || '(未设置)'}`);
  console.log(`🔑 GitHub Token: ${GITHUB_TOKEN ? '已配置 (' + GITHUB_TOKEN.substring(0, 8) + '...)' : '❌ 未配置'}`);
});