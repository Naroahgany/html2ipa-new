// API 后端地址
// 使用空字符串表示相对路径（前后端部署在同一个服务上）
// 如果前后端分开部署，才需要填写完整的后端 URL（如 'https://xxx.onrender.com'）
const API_BASE = '';

console.log('[IPA Builder] 前端已加载，API 模式:', API_BASE ? '远程后端 ' + API_BASE : '同源部署（相对路径）');

// DOM 元素引用
const buildForm = document.getElementById('build-form');
const iconFile = document.getElementById('iconFile');
const uploadPlaceholder = document.getElementById('uploadPlaceholder');
const iconUploadArea = document.getElementById('iconUploadArea');
const croppedIconContainer = document.getElementById('croppedIconContainer');
const croppedIconPreview = document.getElementById('croppedIconPreview');
const recropBtn = document.getElementById('recropBtn');
const submitBtn = document.getElementById('submitBtn');
const statusDiv = document.getElementById('status');
const statusText = document.getElementById('statusText');
const resultDiv = document.getElementById('result');
const downloadLink = document.getElementById('downloadLink');
const resetBtn = document.getElementById('resetBtn');
const errorDiv = document.getElementById('error');
const errorText = document.getElementById('errorText');
const retryBtn = document.getElementById('retryBtn');
const connectionStatus = document.getElementById('connectionStatus');

// 裁剪相关元素
const cropModal = document.getElementById('cropModal');
const cropImage = document.getElementById('cropImage');
const cropImageWrapper = document.getElementById('cropImageWrapper');
const cropBox = document.getElementById('cropBox');
const cropPreviewCanvas = document.getElementById('cropPreviewCanvas');
const cropCancelBtn = document.getElementById('cropCancelBtn');
const cropConfirmBtn = document.getElementById('cropConfirmBtn');

// 当前构建信息
let currentBuild = {
  requestId: null,
  appName: null
};

// 后端连接状态
let backendConnected = false;

// 裁剪状态
let cropState = {
  originalImage: null,
  imageWidth: 0,
  imageHeight: 0,
  cropX: 0,
  cropY: 0,
  cropSize: 100,
  isDragging: false,
  isResizing: false,
  resizeCorner: null,
  startX: 0,
  startY: 0,
  startCropX: 0,
  startCropY: 0,
  startCropSize: 0
};

// 最终裁剪后的 Base64 数据
let croppedIconBase64 = null;

// 图标文件上传 - 触发裁剪
iconFile.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    // 验证文件类型 (支持 png/PNG/jpg/JPG/jpeg/JPEG)
    // 浏览器对 .jpg 和 .jpeg 都返回 image/jpeg
    if (!file.type.match(/^image\/(png|jpeg)$/i)) {
      alert('请上传 PNG 或 JPG/JPEG 格式的图片');
      iconFile.value = '';
      return;
    }
    
    // 验证文件大小 (最大 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('图片文件不能超过 10MB');
      iconFile.value = '';
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
      openCropModal(e.target.result);
    };
    reader.readAsDataURL(file);
  }
});

// 重新裁剪按钮
recropBtn.addEventListener('click', () => {
  if (cropState.originalImage) {
    openCropModal(cropState.originalImage);
  }
});

// 打开裁剪模态框
function openCropModal(imageSrc) {
  cropState.originalImage = imageSrc;
  cropImage.src = imageSrc;
  cropModal.style.display = 'flex';
  
  // 等待图片加载
  cropImage.onload = () => {
    initCropBox();
    updateCropPreview();
  };
}

// 初始化裁剪框
function initCropBox() {
  const rect = cropImage.getBoundingClientRect();
  cropState.imageWidth = rect.width;
  cropState.imageHeight = rect.height;
  
  // 初始裁剪框大小为图片较短边的80%
  const minDimension = Math.min(cropState.imageWidth, cropState.imageHeight);
  cropState.cropSize = minDimension * 0.8;
  
  // 居中放置裁剪框
  cropState.cropX = (cropState.imageWidth - cropState.cropSize) / 2;
  cropState.cropY = (cropState.imageHeight - cropState.cropSize) / 2;
  
  updateCropBoxPosition();
}

// 更新裁剪框位置
function updateCropBoxPosition() {
  cropBox.style.left = cropState.cropX + 'px';
  cropBox.style.top = cropState.cropY + 'px';
  cropBox.style.width = cropState.cropSize + 'px';
  cropBox.style.height = cropState.cropSize + 'px';
}

// 更新预览
function updateCropPreview() {
  const canvas = cropPreviewCanvas;
  const ctx = canvas.getContext('2d');
  
  // 创建临时图片获取原始尺寸
  const img = new Image();
  img.src = cropState.originalImage;
  
  img.onload = () => {
    // 计算原始图片与显示图片的比例
    const scaleX = img.naturalWidth / cropState.imageWidth;
    const scaleY = img.naturalHeight / cropState.imageHeight;
    
    // 原始图片上的裁剪区域
    const srcX = cropState.cropX * scaleX;
    const srcY = cropState.cropY * scaleY;
    const srcSize = cropState.cropSize * Math.max(scaleX, scaleY);
    
    // 绘制到预览画布
    ctx.clearRect(0, 0, 120, 120);
    ctx.drawImage(
      img,
      srcX, srcY, srcSize, srcSize,
      0, 0, 120, 120
    );
  };
}

// 裁剪框拖动和缩放事件
cropBox.addEventListener('mousedown', handleCropStart);
cropBox.addEventListener('touchstart', handleCropStart);

document.addEventListener('mousemove', handleCropMove);
document.addEventListener('touchmove', handleCropMove);

document.addEventListener('mouseup', handleCropEnd);
document.addEventListener('touchend', handleCropEnd);

function handleCropStart(e) {
  e.preventDefault();
  
  const touch = e.touches ? e.touches[0] : e;
  const target = e.target;
  
  cropState.startX = touch.clientX;
  cropState.startY = touch.clientY;
  cropState.startCropX = cropState.cropX;
  cropState.startCropY = cropState.cropY;
  cropState.startCropSize = cropState.cropSize;
  
  // 检查是否点击了角落（缩放）
  if (target.classList.contains('crop-box-corner')) {
    cropState.isResizing = true;
    cropState.resizeCorner = target.classList.contains('top-left') ? 'top-left' :
                             target.classList.contains('top-right') ? 'top-right' :
                             target.classList.contains('bottom-left') ? 'bottom-left' : 'bottom-right';
  } else {
    cropState.isDragging = true;
  }
}

function handleCropMove(e) {
  if (!cropState.isDragging && !cropState.isResizing) return;
  
  const touch = e.touches ? e.touches[0] : e;
  const deltaX = touch.clientX - cropState.startX;
  const deltaY = touch.clientY - cropState.startY;
  
  if (cropState.isDragging) {
    // 拖动裁剪框
    let newX = cropState.startCropX + deltaX;
    let newY = cropState.startCropY + deltaY;
    
    // 边界限制
    newX = Math.max(0, Math.min(newX, cropState.imageWidth - cropState.cropSize));
    newY = Math.max(0, Math.min(newY, cropState.imageHeight - cropState.cropSize));
    
    cropState.cropX = newX;
    cropState.cropY = newY;
  } else if (cropState.isResizing) {
    // 缩放裁剪框（保持正方形）
    const delta = Math.max(Math.abs(deltaX), Math.abs(deltaY));
    const sign = (deltaX + deltaY) > 0 ? 1 : -1;
    
    let newSize;
    let newX = cropState.startCropX;
    let newY = cropState.startCropY;
    
    if (cropState.resizeCorner === 'bottom-right') {
      newSize = cropState.startCropSize + (deltaX + deltaY) / 2;
    } else if (cropState.resizeCorner === 'top-left') {
      newSize = cropState.startCropSize - (deltaX + deltaY) / 2;
      newX = cropState.startCropX + cropState.startCropSize - newSize;
      newY = cropState.startCropY + cropState.startCropSize - newSize;
    } else if (cropState.resizeCorner === 'top-right') {
      newSize = cropState.startCropSize + (deltaX - deltaY) / 2;
      newY = cropState.startCropY + cropState.startCropSize - newSize;
    } else {
      newSize = cropState.startCropSize + (-deltaX + deltaY) / 2;
      newX = cropState.startCropX + cropState.startCropSize - newSize;
    }
    
    // 最小尺寸限制
    newSize = Math.max(50, newSize);
    
    // 边界限制
    if (newX < 0) {
      newSize += newX;
      newX = 0;
    }
    if (newY < 0) {
      newSize += newY;
      newY = 0;
    }
    if (newX + newSize > cropState.imageWidth) {
      newSize = cropState.imageWidth - newX;
    }
    if (newY + newSize > cropState.imageHeight) {
      newSize = cropState.imageHeight - newY;
    }
    
    cropState.cropSize = newSize;
    cropState.cropX = newX;
    cropState.cropY = newY;
  }
  
  updateCropBoxPosition();
  updateCropPreview();
}

function handleCropEnd() {
  cropState.isDragging = false;
  cropState.isResizing = false;
  cropState.resizeCorner = null;
}

// 取消裁剪
cropCancelBtn.addEventListener('click', () => {
  cropModal.style.display = 'none';
  iconFile.value = '';
});

// 确认裁剪
cropConfirmBtn.addEventListener('click', () => {
  // 生成最终裁剪图片
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  // 输出 1024x1024 的图标
  canvas.width = 1024;
  canvas.height = 1024;
  
  const img = new Image();
  img.src = cropState.originalImage;
  
  img.onload = () => {
    // 计算原始图片与显示图片的比例
    const scaleX = img.naturalWidth / cropState.imageWidth;
    const scaleY = img.naturalHeight / cropState.imageHeight;
    
    // 原始图片上的裁剪区域
    const srcX = cropState.cropX * scaleX;
    const srcY = cropState.cropY * scaleY;
    const srcSize = cropState.cropSize * Math.max(scaleX, scaleY);
    
    // 绘制到 1024x1024 画布
    ctx.drawImage(
      img,
      srcX, srcY, srcSize, srcSize,
      0, 0, 1024, 1024
    );
    
    // 获取 Base64（去掉前缀）
    const dataUrl = canvas.toDataURL('image/png');
    croppedIconBase64 = dataUrl.split(',')[1];
    
    // 更新预览
    croppedIconPreview.src = dataUrl;
    uploadPlaceholder.style.display = 'none';
    croppedIconContainer.style.display = 'flex';
    
    // 关闭模态框
    cropModal.style.display = 'none';
  };
});

// 表单提交处理
buildForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  console.log('[IPA Builder] 表单提交被触发');
  
  const appName = document.getElementById('appName').value.trim();
  const websiteUrl = document.getElementById('websiteUrl').value.trim();
  
  console.log('[IPA Builder] 表单数据:', { appName, websiteUrl, hasIcon: !!croppedIconBase64 });
  
  // 验证
  if (!appName || !websiteUrl) {
    alert('请填写应用名称和网页链接');
    console.warn('[IPA Builder] 验证失败: 缺少应用名称或网页链接');
    return;
  }
  
  if (!croppedIconBase64) {
    alert('请上传并裁剪应用图标');
    console.warn('[IPA Builder] 验证失败: 未上传图标');
    return;
  }
  
  // 验证 URL 格式
  try {
    new URL(websiteUrl);
  } catch {
    alert('请输入有效的网页链接');
    console.warn('[IPA Builder] 验证失败: URL 格式无效');
    return;
  }
  
  // 检查后端连接
  if (!backendConnected) {
    const apiDisplay = API_BASE || window.location.origin;
    const confirmBuild = confirm(
      '⚠️ 警告：后端服务似乎未连接。\n\n' +
      '可能原因：\n' +
      '1. Render 免费层后端正在冷启动（需等待约 30-60 秒）\n' +
      '2. 后端服务未部署或已暂停\n\n' +
      '当前后端地址: ' + apiDisplay + '\n\n' +
      '是否仍要尝试提交？'
    );
    if (!confirmBuild) return;
  }
  
  // 保存当前构建信息
  currentBuild.appName = appName;
  
  // 显示状态
  showStatus('正在连接后端服务...');
  console.log('[IPA Builder] 正在发送构建请求到:', `${API_BASE}/api/build`);
  
  try {
    // 调用后端 API 触发构建
    const buildRes = await fetch(`${API_BASE}/api/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appName,
        websiteUrl,
        iconBase64: croppedIconBase64
      })
    });
    
    console.log('[IPA Builder] 构建请求响应状态:', buildRes.status);
    
    const buildData = await buildRes.json();
    console.log('[IPA Builder] 构建响应数据:', buildData);
    
    if (!buildData.success) {
      throw new Error(buildData.error || '构建请求失败');
    }
    
    currentBuild.requestId = buildData.requestId;
    
    // 开始轮询构建状态
    updateStatus('正在编译中... (约需 2-3 分钟)');
    const result = await pollBuildStatus(buildData.requestId, appName);
    
    // 显示下载结果
    showResult(result);
    
  } catch (error) {
    console.error('[IPA Builder] 构建错误:', error);
    
    // 提供更友好的错误信息
    let errorMessage = error.message;
    const apiDisplay = API_BASE || window.location.origin;
    if (error.message === 'Failed to fetch' || error.message.includes('NetworkError') || error.message.includes('network')) {
      errorMessage = '无法连接到后端服务！\n\n可能原因：\n' +
        '1. Render 免费层后端尚未启动（首次访问需等待 30-60 秒）\n' +
        '2. 后端服务未部署或已暂停\n' +
        '3. 网络连接问题\n\n' +
        '当前后端地址: ' + apiDisplay + '\n' +
        '请先在浏览器中直接访问: ' + apiDisplay + '/api/health 确认后端是否在线';
    }
    showError(errorMessage);
  }
});

// 轮询构建状态
async function pollBuildStatus(requestId, appName, maxAttempts = 60) {
  let attempts = 0;
  console.log('[IPA Builder] 开始轮询构建状态, requestId:', requestId);
  
  while (attempts < maxAttempts) {
    attempts++;
    
    try {
      const pollUrl = `${API_BASE}/api/status/${requestId}?appName=${encodeURIComponent(appName)}`;
      console.log(`[IPA Builder] 轮询 #${attempts}:`, pollUrl);
      
      const res = await fetch(pollUrl);
      const data = await res.json();
      
      console.log(`[IPA Builder] 轮询 #${attempts} 结果:`, data);
      
      if (data.status === 'completed') {
        return {
          downloadUrl: `${API_BASE}/api/download/${data.artifactId}`,
          artifactName: data.artifactName
        };
      } else if (data.status === 'failed') {
        throw new Error(data.message || '构建失败');
      } else if (data.status === 'error') {
        throw new Error(data.error || '状态查询失败');
      }
      
      // 更新状态文本
      const progress = Math.min(Math.round((attempts / maxAttempts) * 100), 95);
      updateStatus(`正在编译中... (${progress}%) [轮询 ${attempts}/${maxAttempts}]`);
      
    } catch (error) {
      // 网络错误时继续尝试
      console.warn(`[IPA Builder] 轮询 #${attempts} 出错:`, error);
    }
    
    // 等待 10 秒后再次查询
    await sleep(10000);
  }
  
  throw new Error('构建超时，请稍后重试');
}

// 辅助函数：延迟
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// UI 状态函数
function showStatus(message) {
  buildForm.style.display = 'none';
  statusDiv.style.display = 'block';
  resultDiv.style.display = 'none';
  errorDiv.style.display = 'none';
  statusText.textContent = message;
}

function updateStatus(message) {
  statusText.textContent = message;
}

function showResult(result) {
  buildForm.style.display = 'none';
  statusDiv.style.display = 'none';
  resultDiv.style.display = 'block';
  errorDiv.style.display = 'none';
  downloadLink.href = result.downloadUrl;
}

function showError(message) {
  buildForm.style.display = 'none';
  statusDiv.style.display = 'none';
  resultDiv.style.display = 'none';
  errorDiv.style.display = 'block';
  errorText.textContent = message;
}

function resetForm() {
  buildForm.style.display = 'block';
  statusDiv.style.display = 'none';
  resultDiv.style.display = 'none';
  errorDiv.style.display = 'none';
  buildForm.reset();
  uploadPlaceholder.style.display = 'flex';
  croppedIconContainer.style.display = 'none';
  croppedIconBase64 = null;
  cropState.originalImage = null;
  currentBuild = { requestId: null, appName: null };
}

// 重置和重试按钮
resetBtn.addEventListener('click', resetForm);
retryBtn.addEventListener('click', resetForm);

// 更新连接状态 UI
function updateConnectionStatus(connected, message) {
  backendConnected = connected;
  if (connectionStatus) {
    connectionStatus.className = 'connection-status ' + (connected ? 'connected' : 'disconnected');
    connectionStatus.textContent = connected ? '✅ 后端已连接' : '❌ ' + message;
  }
}

// 页面加载时检查 API 可用性
window.addEventListener('load', async () => {
  console.log('[IPA Builder] 页面加载完成，正在检查后端连接...');
  console.log('[IPA Builder] 后端地址:', API_BASE);
  
  updateConnectionStatus(false, '正在连接后端...');
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 秒超时
    
    const res = await fetch(`${API_BASE}/api/health`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (res.ok) {
      const data = await res.json();
      console.log('[IPA Builder] ✅ 后端连接成功:', data);
      updateConnectionStatus(true, '');
    } else {
      console.warn('[IPA Builder] ⚠️ 后端响应异常, 状态码:', res.status);
      updateConnectionStatus(false, '后端响应异常 (HTTP ' + res.status + ')');
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      console.warn('[IPA Builder] ⚠️ 后端连接超时（可能正在冷启动，Render 免费层首次唤醒需 30-60 秒）');
      updateConnectionStatus(false, '连接超时（后端可能正在冷启动，请稍等后刷新）');
    } else {
      console.error('[IPA Builder] ❌ 无法连接后端:', error);
      updateConnectionStatus(false, '无法连接 (' + error.message + ')');
    }
    
    // 自动重试一次（Render 免费层可能需要冷启动时间）
    console.log('[IPA Builder] 30 秒后自动重试连接...');
    setTimeout(async () => {
      try {
        console.log('[IPA Builder] 正在重试连接...');
        updateConnectionStatus(false, '正在重试连接...');
        const retryRes = await fetch(`${API_BASE}/api/health`);
        if (retryRes.ok) {
          const data = await retryRes.json();
          console.log('[IPA Builder] ✅ 重试连接成功:', data);
          updateConnectionStatus(true, '');
        } else {
          console.warn('[IPA Builder] ⚠️ 重试失败, 状态码:', retryRes.status);
          updateConnectionStatus(false, '后端不可用，请检查后端是否已部署');
        }
      } catch (retryError) {
        console.error('[IPA Builder] ❌ 重试连接失败:', retryError);
        updateConnectionStatus(false, '后端不可用，请检查 Render 服务状态');
      }
    }, 30000);
  }
});