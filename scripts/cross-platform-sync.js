/**
 * 跨平台数据同步脚本
 * 支持多设备间的数据同步和冲突解决
 */

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

class CrossPlatformSync {
    constructor() {
        this.config = {
            owner: process.env.GITHUB_OWNER || 'your-username',
            repo: process.env.GITHUB_REPO || 'your-repo',
            token: process.env.GITHUB_TOKEN || '',
            dataFile: 'ip-records.json',
            configFile: 'src/config.js',
            syncBranch: 'main',
            localSyncDir: './sync-cache',
            syncInterval: 5 * 60 * 1000, // 5分钟
            conflictResolution: 'merge', // 'merge', 'local', 'remote'
            deviceId: process.env.DEVICE_ID || this.generateDeviceId()
        };
        
        this.syncHistory = [];
        this.conflictLog = [];
        
        // 确保同步缓存目录存在
        if (!fs.existsSync(this.config.localSyncDir)) {
            fs.mkdirSync(this.config.localSyncDir, { recursive: true });
        }
    }
    
    /**
     * 生成设备ID
     */
    generateDeviceId() {
        const os = require('os');
        const crypto = require('crypto');
        const hostname = os.hostname();
        const platform = os.platform();
        const arch = os.arch();
        
        return crypto.createHash('md5')
            .update(`${hostname}-${platform}-${arch}-${Date.now()}`)
            .digest('hex')
            .substring(0, 12);
    }
    
    /**
     * 获取GitHub文件内容
     */
    async getGitHubFile(fileName) {
        try {
            const url = `https://api.github.com/repos/${this.config.owner}/${this.config.repo}/contents/${fileName}`;
            const response = await fetch(url, {
                headers: {
                    'Authorization': `token ${this.config.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'CrossPlatformSync/1.0'
                }
            });
            
            if (!response.ok) {
                throw new Error(`GitHub API错误: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            const content = Buffer.from(data.content, 'base64').toString('utf8');
            
            return {
                content,
                sha: data.sha,
                lastModified: new Date(data.commit?.committer?.date || Date.now()),
                size: data.size
            };
        } catch (error) {
            console.error(`获取GitHub文件失败 (${fileName}):`, error.message);
            return null;
        }
    }
    
    /**
     * 更新GitHub文件
     */
    async updateGitHubFile(fileName, content, sha, message) {
        try {
            const url = `https://api.github.com/repos/${this.config.owner}/${this.config.repo}/contents/${fileName}`;
            const response = await fetch(url, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${this.config.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json',
                    'User-Agent': 'CrossPlatformSync/1.0'
                },
                body: JSON.stringify({
                    message: message || `跨平台同步更新 ${fileName} [${this.config.deviceId}]`,
                    content: Buffer.from(content).toString('base64'),
                    sha: sha,
                    branch: this.config.syncBranch
                })
            });
            
            if (!response.ok) {
                throw new Error(`GitHub更新失败: ${response.status} ${response.statusText}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error(`更新GitHub文件失败 (${fileName}):`, error.message);
            return null;
        }
    }
    
    /**
     * 获取本地文件信息
     */
    getLocalFileInfo(fileName) {
        try {
            const filePath = path.join(process.cwd(), fileName);
            if (!fs.existsSync(filePath)) {
                return null;
            }
            
            const stats = fs.statSync(filePath);
            const content = fs.readFileSync(filePath, 'utf8');
            
            return {
                content,
                lastModified: stats.mtime,
                size: stats.size,
                path: filePath
            };
        } catch (error) {
            console.error(`获取本地文件信息失败 (${fileName}):`, error.message);
            return null;
        }
    }
    
    /**
     * 检测冲突
     */
    detectConflict(localFile, remoteFile) {
        if (!localFile || !remoteFile) {
            return false;
        }
        
        // 内容不同且修改时间相近（5分钟内）认为是冲突
        const timeDiff = Math.abs(localFile.lastModified - remoteFile.lastModified);
        const hasContentDiff = localFile.content !== remoteFile.content;
        const isRecentChange = timeDiff < 5 * 60 * 1000; // 5分钟
        
        return hasContentDiff && isRecentChange;
    }
    
    /**
     * 解决冲突
     */
    resolveConflict(fileName, localFile, remoteFile) {
        const conflict = {
            fileName,
            timestamp: new Date(),
            deviceId: this.config.deviceId,
            resolution: this.config.conflictResolution,
            localModified: localFile.lastModified,
            remoteModified: remoteFile.lastModified
        };
        
        let resolvedContent;
        
        switch (this.config.conflictResolution) {
            case 'local':
                resolvedContent = localFile.content;
                conflict.action = '使用本地版本';
                break;
                
            case 'remote':
                resolvedContent = remoteFile.content;
                conflict.action = '使用远程版本';
                break;
                
            case 'merge':
            default:
                resolvedContent = this.mergeContent(fileName, localFile.content, remoteFile.content);
                conflict.action = '合并版本';
                break;
        }
        
        this.conflictLog.push(conflict);
        console.log(`🔄 冲突解决: ${fileName} - ${conflict.action}`);
        
        return resolvedContent;
    }
    
    /**
     * 合并内容
     */
    mergeContent(fileName, localContent, remoteContent) {
        try {
            if (fileName.endsWith('.json')) {
                // JSON文件合并
                const localData = JSON.parse(localContent);
                const remoteData = JSON.parse(remoteContent);
                
                if (Array.isArray(localData) && Array.isArray(remoteData)) {
                    // 数组合并，去重
                    const merged = [...localData];
                    remoteData.forEach(item => {
                        if (!merged.find(local => JSON.stringify(local) === JSON.stringify(item))) {
                            merged.push(item);
                        }
                    });
                    return JSON.stringify(merged, null, 2);
                } else {
                    // 对象合并
                    const merged = { ...remoteData, ...localData };
                    return JSON.stringify(merged, null, 2);
                }
            } else {
                // 非JSON文件，优先使用本地版本
                return localContent;
            }
        } catch (error) {
            console.warn(`合并内容失败，使用本地版本: ${error.message}`);
            return localContent;
        }
    }
    
    /**
     * 同步单个文件
     */
    async syncFile(fileName) {
        try {
            console.log(`🔄 同步文件: ${fileName}`);
            
            const localFile = this.getLocalFileInfo(fileName);
            const remoteFile = await this.getGitHubFile(fileName);
            
            if (!localFile && !remoteFile) {
                console.log(`⚠️  文件不存在: ${fileName}`);
                return { success: false, reason: '文件不存在' };
            }
            
            if (!localFile && remoteFile) {
                // 下载远程文件
                fs.writeFileSync(path.join(process.cwd(), fileName), remoteFile.content);
                console.log(`⬇️  下载: ${fileName}`);
                return { success: true, action: 'download' };
            }
            
            if (localFile && !remoteFile) {
                // 上传本地文件
                const result = await this.updateGitHubFile(fileName, localFile.content, null, `新增文件: ${fileName}`);
                if (result) {
                    console.log(`⬆️  上传: ${fileName}`);
                    return { success: true, action: 'upload' };
                }
                return { success: false, reason: '上传失败' };
            }
            
            // 两个文件都存在，检查是否需要同步
            if (localFile.content === remoteFile.content) {
                console.log(`✅ 已同步: ${fileName}`);
                return { success: true, action: 'no_change' };
            }
            
            // 检测冲突
            if (this.detectConflict(localFile, remoteFile)) {
                console.log(`⚠️  检测到冲突: ${fileName}`);
                const resolvedContent = this.resolveConflict(fileName, localFile, remoteFile);
                
                // 更新本地文件
                fs.writeFileSync(localFile.path, resolvedContent);
                
                // 更新远程文件
                const result = await this.updateGitHubFile(fileName, resolvedContent, remoteFile.sha, `解决冲突: ${fileName}`);
                if (result) {
                    console.log(`🔀 冲突已解决: ${fileName}`);
                    return { success: true, action: 'conflict_resolved' };
                }
                return { success: false, reason: '冲突解决失败' };
            }
            
            // 无冲突，选择较新的版本
            if (localFile.lastModified > remoteFile.lastModified) {
                // 本地较新，上传
                const result = await this.updateGitHubFile(fileName, localFile.content, remoteFile.sha, `同步更新: ${fileName}`);
                if (result) {
                    console.log(`⬆️  同步上传: ${fileName}`);
                    return { success: true, action: 'sync_upload' };
                }
                return { success: false, reason: '同步上传失败' };
            } else {
                // 远程较新，下载
                fs.writeFileSync(localFile.path, remoteFile.content);
                console.log(`⬇️  同步下载: ${fileName}`);
                return { success: true, action: 'sync_download' };
            }
            
        } catch (error) {
            console.error(`同步文件失败 (${fileName}):`, error.message);
            return { success: false, reason: error.message };
        }
    }
    
    /**
     * 执行完整同步
     */
    async performSync() {
        console.log('🚀 开始跨平台数据同步...');
        console.log(`📱 设备ID: ${this.config.deviceId}`);
        console.log(`📂 仓库: ${this.config.owner}/${this.config.repo}`);
        console.log('');
        
        const syncResults = [];
        const filesToSync = [this.config.dataFile, this.config.configFile];
        
        for (const fileName of filesToSync) {
            const result = await this.syncFile(fileName);
            syncResults.push({ fileName, ...result });
        }
        
        // 记录同步历史
        const syncRecord = {
            timestamp: new Date(),
            deviceId: this.config.deviceId,
            results: syncResults,
            conflicts: this.conflictLog.length
        };
        
        this.syncHistory.push(syncRecord);
        
        // 生成同步报告
        const successful = syncResults.filter(r => r.success).length;
        const failed = syncResults.filter(r => !r.success).length;
        
        console.log('\n📊 同步结果');
        console.log('=' .repeat(40));
        console.log(`✅ 成功: ${successful}`);
        console.log(`❌ 失败: ${failed}`);
        console.log(`🔀 冲突: ${this.conflictLog.length}`);
        
        if (failed > 0) {
            console.log('\n失败详情:');
            syncResults.filter(r => !r.success).forEach(r => {
                console.log(`  ${r.fileName}: ${r.reason}`);
            });
        }
        
        return {
            success: failed === 0,
            total: syncResults.length,
            successful,
            failed,
            conflicts: this.conflictLog.length,
            results: syncResults
        };
    }
    
    /**
     * 启动定期同步
     */
    startPeriodicSync() {
        console.log(`⏰ 启动定期同步，间隔: ${this.config.syncInterval / 1000 / 60} 分钟`);
        
        // 立即执行一次同步
        this.performSync();
        
        // 设置定期同步
        setInterval(() => {
            this.performSync();
        }, this.config.syncInterval);
    }
    
    /**
     * 获取同步状态
     */
    getSyncStatus() {
        return {
            deviceId: this.config.deviceId,
            lastSync: this.syncHistory.length > 0 ? this.syncHistory[this.syncHistory.length - 1].timestamp : null,
            totalSyncs: this.syncHistory.length,
            totalConflicts: this.conflictLog.length,
            syncInterval: this.config.syncInterval
        };
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    const sync = new CrossPlatformSync();
    
    const args = process.argv.slice(2);
    
    if (args.includes('--periodic')) {
        sync.startPeriodicSync();
    } else if (args.includes('--status')) {
        console.log('📊 同步状态:', JSON.stringify(sync.getSyncStatus(), null, 2));
    } else {
        sync.performSync().then(result => {
            process.exit(result.success ? 0 : 1);
        }).catch(error => {
            console.error('同步失败:', error.message);
            process.exit(1);
        });
    }
}

module.exports = CrossPlatformSync;