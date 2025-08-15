# Netlify 数据仓库管理工具

这个项目包含了用于管理 Netlify 后台管理页面数据的 Node.js 脚本集合，支持数据备份、验证、跨平台同步和离线缓存等功能。

## 🚀 功能特性

### 📦 数据备份 (backup-data.js)
- ✅ 支持多文件备份（JSON 和 JS 配置文件）
- ✅ 可选数据压缩功能
- ✅ 本地和 GitHub 双重备份
- ✅ 自动备份版本管理
- ✅ 备份完整性验证

### 🔍 数据验证 (validate-data.js)
- ✅ JSON 数据格式验证
- ✅ 产品配置数据验证
- ✅ JavaScript 配置文件语法检查
- ✅ 多文件批量验证
- ✅ 详细的验证报告

### 🧪 API 测试 (test-api.js)
- ✅ GitHub API 连接测试
- ✅ 缓存功能测试
- ✅ 重试机制测试
- ✅ 多文件支持测试
- ✅ 备份分支访问测试

### 🔄 跨平台同步 (cross-platform-sync.js)
- ✅ 多设备数据同步
- ✅ 智能冲突检测和解决
- ✅ 定期自动同步
- ✅ 同步历史记录
- ✅ 设备标识管理

### 💾 离线缓存管理 (offline-cache-manager.js)
- ✅ 智能数据缓存
- ✅ 可选数据压缩和加密
- ✅ 自动过期清理
- ✅ 缓存大小管理
- ✅ 详细的缓存统计

### 🧹 数据清理 (cleanup.js)
- ✅ 过期数据清理
- ✅ 重复数据检测
- ✅ 干运行模式
- ✅ 清理统计报告

## 📋 环境要求

- Node.js 12.0 或更高版本
- npm 或 yarn 包管理器
- GitHub Personal Access Token（用于 API 访问）

## ⚙️ 环境变量配置

创建 `.env` 文件或设置以下环境变量：

```bash
# GitHub 配置
GITHUB_OWNER=your-username
GITHUB_REPO=your-repo-name
GITHUB_TOKEN=your-github-token

# 设备标识（可选）
DEVICE_ID=your-device-id

# 缓存加密密钥（可选）
CACHE_ENCRYPTION_KEY=your-encryption-key

# 压缩启用（可选）
COMPRESSION_ENABLED=true
```

## 🛠️ 安装和使用

### 1. 安装依赖

```bash
npm install
# 或者
npm run install-deps
```

### 2. 基本命令

#### 数据备份
```bash
# 基本备份
npm run backup

# 多文件备份（带压缩）
npm run backup:multi

# 仅备份配置文件
npm run backup:config
```

#### 数据验证
```bash
# 验证默认数据文件
npm run validate

# 验证所有支持的文件
npm run validate:all
```

#### API 测试
```bash
# 基本 API 测试
npm run test

# 增强功能测试
npm run test:enhanced
```

#### 跨平台同步
```bash
# 执行一次同步
npm run sync

# 启动定期同步
npm run sync:periodic

# 查看同步状态
npm run sync:status
```

#### 缓存管理
```bash
# 清理过期缓存
npm run cache:cleanup

# 查看缓存统计
npm run cache:stats

# 清空所有缓存
npm run cache:clear
```

#### 数据清理
```bash
# 清理过期数据
npm run cleanup

# 干运行模式（仅显示将要清理的内容）
npm run cleanup:dry-run
```

### 3. 综合维护命令

```bash
# 健康检查（测试 + 验证 + 备份 + 同步）
npm run health-check

# 完整维护（缓存清理 + 数据清理 + 健康检查）
npm run full-maintenance
```

## 📊 脚本详细说明

### backup-data.js
支持的配置选项：
- `dataFile`: 主数据文件路径
- `configFile`: 配置文件路径
- `compressionEnabled`: 启用数据压缩
- `maxBackups`: 最大备份数量
- `backupBranch`: GitHub 备份分支

### validate-data.js
验证功能：
- JSON 格式验证
- 必需字段检查
- 数据类型验证
- ASIN 格式验证
- URL 有效性检查
- 价格和评分范围验证

### cross-platform-sync.js
同步策略：
- `merge`: 智能合并（默认）
- `local`: 优先使用本地版本
- `remote`: 优先使用远程版本

冲突解决：
- 自动检测修改时间冲突
- JSON 数组智能合并
- 对象属性合并
- 冲突日志记录

### offline-cache-manager.js
缓存特性：
- 自动过期管理
- 可选 gzip 压缩
- 可选 AES 加密
- LRU 清理策略
- 缓存命中率统计

## 🔧 高级配置

### 自定义配置文件

可以通过修改各脚本中的 `config` 对象来自定义行为：

```javascript
// 示例：修改备份配置
const config = {
    owner: 'your-username',
    repo: 'your-repo',
    token: process.env.GITHUB_TOKEN,
    dataFile: 'ip-records.json',
    configFile: 'src/config.js',
    compressionEnabled: true,
    maxBackups: 10,
    backupBranch: 'backup'
};
```

### 定时任务设置

可以使用 cron 或系统任务调度器来定期运行维护脚本：

```bash
# 每小时执行健康检查
0 * * * * cd /path/to/project && npm run health-check

# 每天凌晨执行完整维护
0 0 * * * cd /path/to/project && npm run full-maintenance
```

## 🐛 故障排除

### 常见问题

1. **GitHub API 限制**
   - 确保 GitHub Token 有足够的权限
   - 注意 API 调用频率限制

2. **文件权限问题**
   - 确保脚本有读写本地文件的权限
   - 检查缓存和备份目录的权限

3. **网络连接问题**
   - 检查网络连接
   - 考虑使用代理设置

4. **数据格式错误**
   - 使用验证脚本检查数据格式
   - 查看详细的错误日志

### 日志和调试

所有脚本都提供详细的控制台输出，包括：
- 操作进度指示
- 成功/失败状态
- 错误详细信息
- 统计数据

## 📈 性能优化建议

1. **启用压缩**：对于大型数据文件，启用压缩可以显著减少存储空间和传输时间
2. **合理设置缓存大小**：根据可用磁盘空间调整缓存限制
3. **定期清理**：设置自动清理任务，避免累积过多过期数据
4. **批量操作**：尽可能使用批量操作减少 API 调用次数

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request 来改进这个项目。在提交代码前，请确保：

1. 代码通过所有测试
2. 遵循现有的代码风格
3. 添加适当的注释和文档
4. 更新相关的 README 内容

## 📄 许可证

本项目采用 MIT 许可证。详见 LICENSE 文件。

## 🔗 相关链接

- [GitHub API 文档](https://docs.github.com/en/rest)
- [Node.js 官方文档](https://nodejs.org/docs/)
- [npm 脚本指南](https://docs.npmjs.com/cli/v7/using-npm/scripts)