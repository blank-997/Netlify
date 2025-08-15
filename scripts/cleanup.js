// 自动清理脚本 - 定期清理过期IP记录

// 配置信息
const CONFIG = {
    github: {
        owner: process.env.GITHUB_OWNER || 'YOUR_GITHUB_USERNAME',
        repo: process.env.GITHUB_REPO || 'ip-records-db',
        token: process.env.GITHUB_TOKEN || 'YOUR_GITHUB_TOKEN',
        branch: 'main'
    },
    retentionDays: 15
};

// 导入fetch（Node.js环境）
let fetch;
if (typeof window === 'undefined') {
    fetch = require('node-fetch');
} else {
    fetch = window.fetch;
}

class CleanupService {
    constructor(config) {
        this.config = config;
        this.baseUrl = 'https://api.github.com';
        this.dataFile = 'ip-records.json';
    }

    // 获取文件内容
    async getFileContent() {
        try {
            const response = await fetch(
                `${this.baseUrl}/repos/${this.config.github.owner}/${this.config.github.repo}/contents/${this.dataFile}?ref=${this.config.github.branch}`,
                {
                    headers: {
                        'Authorization': `token ${this.config.github.token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                }
            );
            
            if (response.status === 404) {
                console.log('数据文件不存在，无需清理');
                return null;
            }
            
            if (!response.ok) {
                throw new Error(`GitHub API错误: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            const content = JSON.parse(atob(data.content));
            return { records: content.records || [], sha: data.sha, metadata: content.metadata };
        } catch (error) {
            console.error('获取文件内容失败:', error);
            throw error;
        }
    }

    // 更新文件内容
    async updateFileContent(records, sha, metadata) {
        const content = {
            records: records,
            lastUpdated: new Date().toISOString(),
            metadata: {
                ...metadata,
                lastCleanup: new Date().toISOString(),
                cleanupCount: (metadata?.cleanupCount || 0) + 1
            }
        };
        
        const encodedContent = btoa(JSON.stringify(content, null, 2));
        
        const body = {
            message: `自动清理过期IP记录 - ${new Date().toISOString()}`,
            content: encodedContent,
            branch: this.config.github.branch,
            sha: sha
        };
        
        try {
            const response = await fetch(
                `${this.baseUrl}/repos/${this.config.github.owner}/${this.config.github.repo}/contents/${this.dataFile}`,
                {
                    method: 'PUT',
                    headers: {
                        'Authorization': `token ${this.config.github.token}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(body)
                }
            );
            
            if (!response.ok) {
                throw new Error(`更新文件失败: ${response.status} ${response.statusText}`);
            }
            
            return true;
        } catch (error) {
            console.error('更新文件内容失败:', error);
            throw error;
        }
    }

    // 清理过期记录 - 只清理IP信息，保留其他数据
    cleanExpiredRecords(records) {
        const now = new Date();
        const cutoffDate = new Date(now.getTime() - this.config.retentionDays * 24 * 60 * 60 * 1000);
        
        let expiredCount = 0;
        const processedRecords = records.map(record => {
            const recordDate = new Date(record.timestamp);
            if (recordDate < cutoffDate) {
                expiredCount++;
                // 只清理IP相关敏感信息，保留评价数据
                return {
                    ...record,
                    ip: "[已清理]",
                    country: "[已清理]",
                    timezone: "[已清理]",
                    userAgent: "[已清理]",
                    countryCode: "[已清理]",
                    // 保留评价相关数据：productName, asin, rating, comment, timestamp, submissions
                };
            }
            return record;
        });
        
        return {
            validRecords: processedRecords,
            expiredCount,
            totalRecords: records.length
        };
    }

    // 执行清理
    async performCleanup() {
        try {
            console.log('开始清理过期IP记录...');
            
            const fileData = await this.getFileContent();
            if (!fileData) {
                return { success: true, message: '无数据文件需要清理' };
            }
            
            const { validRecords, expiredCount, totalRecords } = this.cleanExpiredRecords(fileData.records);
            
            if (expiredCount === 0) {
                console.log('没有过期记录需要清理');
                return { success: true, message: '没有过期记录需要清理', totalRecords };
            }
            
            console.log(`发现 ${expiredCount} 条过期记录，总记录数: ${totalRecords}`);
            
            await this.updateFileContent(validRecords, fileData.sha, fileData.metadata);
            
            const message = `清理完成！删除了 ${expiredCount} 条过期记录，保留 ${validRecords.length} 条有效记录`;
            console.log(message);
            
            return {
                success: true,
                message,
                expiredCount,
                remainingCount: validRecords.length,
                totalRecords
            };
            
        } catch (error) {
            console.error('清理过程中发生错误:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // 获取清理统计信息
    async getCleanupStats() {
        try {
            const fileData = await this.getFileContent();
            if (!fileData) {
                return { totalRecords: 0, validRecords: 0, expiredRecords: 0 };
            }
            
            const { validRecords, expiredCount, totalRecords } = this.cleanExpiredRecords(fileData.records);
            
            return {
                totalRecords,
                validRecords: validRecords.length,
                expiredRecords: expiredCount,
                lastCleanup: fileData.metadata?.lastCleanup || '从未清理',
                cleanupCount: fileData.metadata?.cleanupCount || 0
            };
        } catch (error) {
            console.error('获取统计信息失败:', error);
            return { error: error.message };
        }
    }
}

// 主函数
async function main() {
    const cleanup = new CleanupService(CONFIG);
    
    // 显示清理前的统计信息
    console.log('=== 清理前统计 ===');
    const beforeStats = await cleanup.getCleanupStats();
    console.log(beforeStats);
    
    // 执行清理
    console.log('\n=== 执行清理 ===');
    const result = await cleanup.performCleanup();
    console.log(result);
    
    // 显示清理后的统计信息
    if (result.success && result.expiredCount > 0) {
        console.log('\n=== 清理后统计 ===');
        const afterStats = await cleanup.getCleanupStats();
        console.log(afterStats);
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    main().catch(console.error);
}

// 导出类和函数
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CleanupService, main };
} else {
    window.CleanupService = CleanupService;
}