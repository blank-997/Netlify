/**
 * 数据备份脚本
 * 用于备份 ip-records.json 文件到指定分支或本地
 */

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

class DataBackup {
    constructor() {
        this.config = {
            owner: process.env.GITHUB_OWNER || 'blank-997',
            repo: process.env.GITHUB_REPO || 'Netlify',
            token: process.env.GITHUB_TOKEN,
            dataFile: 'ip-records.json',
            configFile: 'src/config.js', // 新增：产品配置文件
            backupBranch: process.env.BACKUP_BRANCH || 'backup',
            localBackupDir: process.env.LOCAL_BACKUP_DIR || './backups',
            maxBackups: parseInt(process.env.MAX_BACKUPS) || 7,
            compressionEnabled: process.env.COMPRESSION_ENABLED !== 'false' // 新增：压缩选项
        };
        
        this.apiUrl = `https://api.github.com/repos/${this.config.owner}/${this.config.repo}`;
        this.supportedFiles = [this.config.dataFile, this.config.configFile]; // 支持的备份文件
    }

    /**
     * 获取指定文件内容
     */
    async getFileData(fileName = null) {
        const targetFile = fileName || this.config.dataFile;
        try {
            const response = await fetch(`${this.apiUrl}/contents/${targetFile}`, {
                headers: {
                    'Authorization': `token ${this.config.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Netlify-Data-Backup/2.0'
                }
            });

            if (!response.ok) {
                throw new Error(`获取文件失败 ${targetFile}: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            const content = Buffer.from(data.content, 'base64').toString('utf8');
            
            return {
                fileName: targetFile,
                content,
                sha: data.sha,
                size: data.size,
                lastModified: data.commit ? data.commit.committer.date : new Date().toISOString()
            };
        } catch (error) {
            console.error(`❌ 获取文件 ${targetFile} 失败:`, error.message);
            throw error;
        }
    }

    /**
     * 获取当前数据文件内容（保持向后兼容）
     */
    async getCurrentData() {
        return await this.getFileData(this.config.dataFile);
    }

    /**
     * 压缩数据内容
     */
    compressData(content) {
        if (!this.config.compressionEnabled) {
            return content;
        }
        
        try {
            // 简单的压缩：移除多余空格和换行
            const compressed = JSON.stringify(JSON.parse(content));
            const originalSize = Buffer.byteLength(content, 'utf8');
            const compressedSize = Buffer.byteLength(compressed, 'utf8');
            const ratio = ((originalSize - compressedSize) / originalSize * 100).toFixed(1);
            
            console.log(`📦 数据压缩: ${originalSize} → ${compressedSize} bytes (节省 ${ratio}%)`);
            return compressed;
        } catch (error) {
            console.warn('⚠️ 压缩失败，使用原始数据:', error.message);
            return content;
        }
    }

    /**
     * 创建多文件备份
     */
    async createMultipleBackups() {
        const results = [];
        
        for (const fileName of this.supportedFiles) {
            try {
                console.log(`🔄 开始备份文件: ${fileName}`);
                const fileData = await this.getFileData(fileName);
                
                // 创建本地备份
                await this.createLocalBackup(fileData);
                
                // 创建GitHub备份
                await this.createGitHubBackup(fileData);
                
                results.push({
                    fileName,
                    success: true,
                    message: '备份成功'
                });
                
                console.log(`✅ ${fileName} 备份完成`);
            } catch (error) {
                console.error(`❌ ${fileName} 备份失败:`, error.message);
                results.push({
                    fileName,
                    success: false,
                    message: error.message
                });
            }
        }
        
        return results;
    }

    /**
     * 创建本地备份
     */
    async createLocalBackup(data) {
        try {
            // 确保备份目录存在
            if (!fs.existsSync(this.config.localBackupDir)) {
                fs.mkdirSync(this.config.localBackupDir, { recursive: true });
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const fileName = data.fileName || this.config.dataFile;
            const baseFileName = fileName.replace(/\//g, '_').replace(/\.(json|js)$/, '');
            const backupFileName = `${baseFileName}-${timestamp}.json`;
            const backupPath = path.join(this.config.localBackupDir, backupFileName);

            // 创建备份文件
            const backupData = {
                timestamp: new Date().toISOString(),
                originalFile: fileName,
                sha: data.sha,
                size: data.size,
                lastModified: data.lastModified,
                compressed: this.config.compressionEnabled,
                content: this.config.compressionEnabled ? 
                    this.compressData(data.content) : 
                    (fileName.endsWith('.json') ? JSON.parse(data.content) : data.content)
            };

            fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2));
            console.log(`✅ 本地备份已创建: ${backupPath}`);

            return backupPath;
        } catch (error) {
            console.error('❌ 创建本地备份失败:', error.message);
            throw error;
        }
    }

    /**
     * 清理旧的本地备份
     */
    async cleanupLocalBackups() {
        try {
            if (!fs.existsSync(this.config.localBackupDir)) {
                return;
            }

            const files = fs.readdirSync(this.config.localBackupDir)
                .filter(file => file.startsWith('ip-records-backup-') && file.endsWith('.json'))
                .map(file => ({
                    name: file,
                    path: path.join(this.config.localBackupDir, file),
                    mtime: fs.statSync(path.join(this.config.localBackupDir, file)).mtime
                }))
                .sort((a, b) => b.mtime - a.mtime); // 按修改时间降序排列

            // 删除超过最大备份数量的文件
            if (files.length > this.config.maxBackups) {
                const filesToDelete = files.slice(this.config.maxBackups);
                for (const file of filesToDelete) {
                    fs.unlinkSync(file.path);
                    console.log(`🗑️  删除旧备份: ${file.name}`);
                }
            }

            console.log(`📁 保留 ${Math.min(files.length, this.config.maxBackups)} 个本地备份文件`);
        } catch (error) {
            console.error('❌ 清理本地备份失败:', error.message);
        }
    }

    /**
     * 检查备份分支是否存在
     */
    async checkBackupBranch() {
        try {
            const response = await fetch(`${this.apiUrl}/branches/${this.config.backupBranch}`, {
                headers: {
                    'Authorization': `token ${this.config.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Netlify-Data-Backup/1.0'
                }
            });

            return response.ok;
        } catch (error) {
            return false;
        }
    }

    /**
     * 创建备份分支
     */
    async createBackupBranch() {
        try {
            // 获取主分支的最新commit SHA
            const mainBranchResponse = await fetch(`${this.apiUrl}/branches/main`, {
                headers: {
                    'Authorization': `token ${this.config.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Netlify-Data-Backup/1.0'
                }
            });

            if (!mainBranchResponse.ok) {
                throw new Error('无法获取主分支信息');
            }

            const mainBranch = await mainBranchResponse.json();
            const baseSha = mainBranch.commit.sha;

            // 创建新分支
            const createBranchResponse = await fetch(`${this.apiUrl}/git/refs`, {
                method: 'POST',
                headers: {
                    'Authorization': `token ${this.config.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json',
                    'User-Agent': 'Netlify-Data-Backup/1.0'
                },
                body: JSON.stringify({
                    ref: `refs/heads/${this.config.backupBranch}`,
                    sha: baseSha
                })
            });

            if (!createBranchResponse.ok) {
                throw new Error(`创建备份分支失败: ${createBranchResponse.statusText}`);
            }

            console.log(`✅ 备份分支 '${this.config.backupBranch}' 已创建`);
            return true;
        } catch (error) {
            console.error('❌ 创建备份分支失败:', error.message);
            return false;
        }
    }

    /**
     * 创建GitHub备份
     */
    async createGitHubBackup(data) {
        try {
            // 检查备份分支是否存在
            const branchExists = await this.checkBackupBranch();
            if (!branchExists) {
                const created = await this.createBackupBranch();
                if (!created) {
                    throw new Error('无法创建备份分支');
                }
            }

            // 生成备份文件名
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFileName = `backups/ip-records-${timestamp}.json`;

            // 创建备份内容
            const backupContent = {
                timestamp: new Date().toISOString(),
                originalSha: data.sha,
                originalSize: data.size,
                originalLastModified: data.lastModified,
                data: JSON.parse(data.content)
            };

            const encodedContent = Buffer.from(JSON.stringify(backupContent, null, 2)).toString('base64');

            // 上传备份文件到GitHub
            const uploadResponse = await fetch(`${this.apiUrl}/contents/${backupFileName}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${this.config.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json',
                    'User-Agent': 'Netlify-Data-Backup/1.0'
                },
                body: JSON.stringify({
                    message: `Backup data: ${timestamp}`,
                    content: encodedContent,
                    branch: this.config.backupBranch
                })
            });

            if (!uploadResponse.ok) {
                throw new Error(`上传备份失败: ${uploadResponse.statusText}`);
            }

            console.log(`✅ GitHub备份已创建: ${backupFileName}`);
            return backupFileName;
        } catch (error) {
            console.error('❌ 创建GitHub备份失败:', error.message);
            throw error;
        }
    }

    /**
     * 列出现有备份
     */
    async listBackups() {
        console.log('\n📋 现有备份列表:');
        console.log('=' .repeat(50));

        // 列出本地备份
        console.log('🏠 本地备份:');
        try {
            if (fs.existsSync(this.config.localBackupDir)) {
                const localFiles = fs.readdirSync(this.config.localBackupDir)
                    .filter(file => file.startsWith('ip-records-backup-') && file.endsWith('.json'))
                    .map(file => {
                        const filePath = path.join(this.config.localBackupDir, file);
                        const stats = fs.statSync(filePath);
                        return {
                            name: file,
                            size: (stats.size / 1024).toFixed(2) + ' KB',
                            created: stats.mtime.toISOString()
                        };
                    })
                    .sort((a, b) => new Date(b.created) - new Date(a.created));

                if (localFiles.length > 0) {
                    localFiles.forEach(file => {
                        console.log(`   📄 ${file.name} (${file.size}, ${file.created})`);
                    });
                } else {
                    console.log('   📭 暂无本地备份');
                }
            } else {
                console.log('   📭 本地备份目录不存在');
            }
        } catch (error) {
            console.log(`   ❌ 读取本地备份失败: ${error.message}`);
        }

        // 列出GitHub备份
        console.log('\n☁️  GitHub备份:');
        try {
            const branchExists = await this.checkBackupBranch();
            if (branchExists) {
                const response = await fetch(`${this.apiUrl}/contents/backups?ref=${this.config.backupBranch}`, {
                    headers: {
                        'Authorization': `token ${this.config.token}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'User-Agent': 'Netlify-Data-Backup/1.0'
                    }
                });

                if (response.ok) {
                    const files = await response.json();
                    const backupFiles = files
                        .filter(file => file.name.startsWith('ip-records-') && file.name.endsWith('.json'))
                        .sort((a, b) => b.name.localeCompare(a.name));

                    if (backupFiles.length > 0) {
                        backupFiles.forEach(file => {
                            console.log(`   📄 ${file.name} (${(file.size / 1024).toFixed(2)} KB)`);
                        });
                    } else {
                        console.log('   📭 暂无GitHub备份');
                    }
                } else {
                    console.log('   📭 无法读取GitHub备份目录');
                }
            } else {
                console.log('   📭 备份分支不存在');
            }
        } catch (error) {
            console.log(`   ❌ 读取GitHub备份失败: ${error.message}`);
        }

        console.log('=' .repeat(50));
    }

    /**
     * 执行完整备份
     */
    async backup() {
        try {
            console.log('💾 开始数据备份...');
            
            if (!this.config.token) {
                throw new Error('未设置 GITHUB_TOKEN 环境变量');
            }

            // 获取当前数据
            console.log('📥 获取当前数据...');
            const currentData = await this.getCurrentData();
            
            console.log(`📊 数据信息: ${(currentData.size / 1024).toFixed(2)} KB`);

            // 创建本地备份
            console.log('🏠 创建本地备份...');
            await this.createLocalBackup(currentData);

            // 创建GitHub备份
            console.log('☁️  创建GitHub备份...');
            await this.createGitHubBackup(currentData);

            // 清理旧备份
            console.log('🧹 清理旧备份...');
            await this.cleanupLocalBackups();

            // 显示备份列表
            await this.listBackups();

            console.log('\n🎉 数据备份完成！');
            
        } catch (error) {
            console.error('❌ 备份过程中发生错误:', error.message);
            process.exit(1);
        }
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    const backup = new DataBackup();
    
    // 检查命令行参数
    const args = process.argv.slice(2);
    if (args.includes('--list') || args.includes('-l')) {
        backup.listBackups();
    } else {
        backup.backup();
    }
}

module.exports = DataBackup;