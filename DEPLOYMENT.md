# Vercel 部署指南

## 部署前检查清单

### 1. 项目配置检查
- [x] 确认项目使用 Vite + React + TypeScript 技术栈
- [x] 检查 `package.json` 中的 build 命令配置
- [x] 验证项目可以正常构建
- [x] 检查路由配置和静态资源处理

### 2. Vercel 配置
- [x] 创建 `vercel.json` 配置文件
- [x] 配置构建和部署设置
- [x] 配置路由和资源处理
- [x] 配置缓存策略

### 3. 环境变量配置
- [x] 创建 `.env.example` 文件作为配置模板
- [x] 提供必要的环境变量说明
- [x] 确保敏感信息不被硬编码

## Vercel 部署步骤

### 1. 安装 Vercel CLI（可选）
```bash
npm i -g vercel
```

### 2. 初始化项目（如果尚未初始化）
```bash
vercel init
```

### 3. 配置环境变量
在 Vercel 项目设置中添加以下环境变量：

```env
# 必填配置
NODE_ENV=production

# 可选配置（根据需要）
VITE_PORT=3000
VITE_API_PROXY_TARGET=https://ark.cn-beijing.volces.com/api/coding/v3
VITE_DEFAULT_AI_ENABLED=true
VITE_DEFAULT_AI_PROVIDER=deepseek
VITE_DEFAULT_AI_API_BASE=/api
VITE_DEFAULT_AI_API_KEY=0e3fbda8-afa0-4b6f-9864-ea94e3de353d
VITE_DEFAULT_AI_MODEL=deepseek-v3.2
VITE_DEFAULT_AI_MAX_TOKENS=4000
VITE_DEFAULT_AI_TEMPERATURE=0.3
```

### 4. 部署项目
```bash
vercel deploy --prod
```

## 部署后的注意事项

### 1. 路由配置
- 项目使用 React Router 进行客户端路由
- Vercel 已配置正确的路由重定向规则
- 如果需要服务器端渲染，需要额外配置

### 2. API 代理
- 开发模式下的 API 代理配置在 `vite.config.ts` 中
- 生产环境需要正确的 API 配置
- AI 服务配置需要在用户浏览器端进行设置

### 3. 资源优化
- 项目已配置自动代码分割
- 静态资源会自动优化和缓存
- 图片和其他资源需要正确的路径配置

### 4. 性能优化
- 使用 Vite 的自动优化功能
- 代码已进行树摇优化
- 建议启用 Vercel 的性能监控功能

## 常见问题解决

### 1. 404 错误（页面未找到）
- 检查路由配置是否正确
- 确认 `vercel.json` 中的重定向规则
- 检查静态资源路径是否正确

### 2. API 连接失败
- 检查 API 地址和密钥配置
- 确认 API 服务是否可用
- 检查 CORS 配置（如果是跨域请求）

### 3. 构建失败
- 检查依赖是否正确安装
- 确认 TypeScript 类型检查是否通过
- 检查是否有语法错误或未定义的变量

### 4. 部署超时
- 尝试增加构建超时时间
- 检查项目大小是否过大
- 优化依赖和资源加载

## 性能监控和优化建议

### 1. 使用 Vercel Analytics
- 启用 Vercel 的分析功能
- 监控页面加载时间和资源使用
- 优化性能瓶颈

### 2. 配置 CDN 和缓存
- 启用资源的 CDN 分发
- 配置适当的缓存策略
- 使用 Vercel 的 Edge Network

### 3. 代码优化
- 定期检查和更新依赖
- 优化图片和其他静态资源
- 使用代码分割和懒加载

## 部署成功后的验证

1. 访问部署后的网站
2. 检查页面是否正常加载
3. 测试主要功能是否正常
4. 检查控制台是否有错误信息
5. 验证 API 连接是否正常

## 更新部署

### 1. 自动部署（推荐）
- 启用 Git 仓库连接
- 每次 push 到指定分支时自动部署
- 配置部署预览和生产环境

### 2. 手动部署
```bash
vercel deploy --prod
```

### 3. 部署预览
```bash
vercel deploy
```

## 总结

通过以上步骤，您应该能够成功部署 PromptCard V4 项目到 Vercel 上。如果遇到任何问题，请查看 Vercel 文档或参考项目的配置文件。
