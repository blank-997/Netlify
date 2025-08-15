/**
 * 数据验证脚本
 * 用于验证 ip-records.json 文件的格式和完整性
 */

const fetch = require('node-fetch');

class DataValidator {
    constructor() {
        this.config = {
            owner: process.env.GITHUB_OWNER || 'blank-997',
            repo: process.env.GITHUB_REPO || 'Netlify',
            token: process.env.GITHUB_TOKEN,
            dataFile: 'ip-records.json'
        };
        
        this.apiUrl = `https://api.github.com/repos/${this.config.owner}/${this.config.repo}/contents/${this.config.dataFile}`;
    }

    /**
     * 获取GitHub文件内容
     */
    async getFileContent() {
        try {
            const response = await fetch(this.apiUrl, {
                headers: {
                    'Authorization': `token ${this.config.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Netlify-Data-Validator/1.0'
                }
            });

            if (!response.ok) {
                throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            const content = Buffer.from(data.content, 'base64').toString('utf8');
            
            return {
                content: JSON.parse(content),
                sha: data.sha,
                size: data.size
            };
        } catch (error) {
            console.error('❌ 获取文件内容失败:', error.message);
            throw error;
        }
    }

    /**
     * 验证数据结构
     */
    validateStructure(data) {
        const errors = [];
        const warnings = [];

        // 检查根级属性
        if (!data.hasOwnProperty('records')) {
            errors.push('缺少必需的 "records" 属性');
        }
        if (!data.hasOwnProperty('metadata')) {
            errors.push('缺少必需的 "metadata" 属性');
        }

        // 验证 records 数组
        if (data.records) {
            if (!Array.isArray(data.records)) {
                errors.push('"records" 必须是数组类型');
            } else {
                data.records.forEach((record, index) => {
                    this.validateRecord(record, index, errors, warnings);
                });
            }
        }

        // 验证 metadata 对象
        if (data.metadata) {
            this.validateMetadata(data.metadata, errors, warnings);
        }

        return { errors, warnings };
    }

    /**
     * 验证单个记录
     */
    validateRecord(record, index, errors, warnings) {
        const requiredFields = ['id', 'timestamp'];
        const optionalFields = ['ip', 'productId', 'rating', 'review', 'metadata'];

        // 检查必需字段
        requiredFields.forEach(field => {
            if (!record.hasOwnProperty(field)) {
                errors.push(`记录 ${index}: 缺少必需字段 "${field}"`);
            }
        });

        // 验证时间戳格式
        if (record.timestamp) {
            const timestamp = new Date(record.timestamp);
            if (isNaN(timestamp.getTime())) {
                errors.push(`记录 ${index}: 时间戳格式无效 "${record.timestamp}"`);
            }
        }

        // 验证评分范围
        if (record.rating !== undefined) {
            if (typeof record.rating !== 'number' || record.rating < 1 || record.rating > 5) {
                errors.push(`记录 ${index}: 评分必须是1-5之间的数字`);
            }
        }

        // 检查IP格式（如果存在）
        if (record.ip) {
            const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
            if (!ipRegex.test(record.ip)) {
                warnings.push(`记录 ${index}: IP地址格式可能无效 "${record.ip}"`);
            }
        }

        // 检查产品ID格式
        if (record.productId) {
            if (typeof record.productId !== 'string' || record.productId.length === 0) {
                warnings.push(`记录 ${index}: 产品ID应为非空字符串`);
            }
        }
    }

    /**
     * 验证元数据
     */
    validateMetadata(metadata, errors, warnings) {
        const requiredFields = ['lastUpdated', 'totalRecords', 'version'];
        
        requiredFields.forEach(field => {
            if (!metadata.hasOwnProperty(field)) {
                errors.push(`元数据: 缺少必需字段 "${field}"`);
            }
        });

        // 验证最后更新时间
        if (metadata.lastUpdated) {
            const timestamp = new Date(metadata.lastUpdated);
            if (isNaN(timestamp.getTime())) {
                errors.push(`元数据: lastUpdated 时间戳格式无效`);
            }
        }

        // 验证记录总数
        if (metadata.totalRecords !== undefined) {
            if (typeof metadata.totalRecords !== 'number' || metadata.totalRecords < 0) {
                errors.push(`元数据: totalRecords 必须是非负数`);
            }
        }

        // 验证版本格式
        if (metadata.version) {
            const versionRegex = /^\d+\.\d+\.\d+$/;
            if (!versionRegex.test(metadata.version)) {
                warnings.push(`元数据: 版本号格式建议使用语义化版本 (如: 1.0.0)`);
            }
        }
    }

    /**
     * 验证数据一致性
     */
    validateConsistency(data) {
        const errors = [];
        const warnings = [];

        if (data.records && data.metadata) {
            // 检查记录数量一致性
            const actualCount = data.records.length;
            const metadataCount = data.metadata.totalRecords;
            
            if (actualCount !== metadataCount) {
                errors.push(`数据不一致: 实际记录数 (${actualCount}) 与元数据中的总数 (${metadataCount}) 不匹配`);
            }

            // 检查重复ID
            const ids = data.records.map(record => record.id).filter(id => id);
            const uniqueIds = new Set(ids);
            if (ids.length !== uniqueIds.size) {
                errors.push(`发现重复的记录ID`);
            }

            // 检查时间顺序
            const timestamps = data.records
                .map(record => record.timestamp)
                .filter(ts => ts)
                .map(ts => new Date(ts))
                .filter(date => !isNaN(date.getTime()));
            
            for (let i = 1; i < timestamps.length; i++) {
                if (timestamps[i] < timestamps[i-1]) {
                    warnings.push(`记录时间戳顺序可能不正确`);
                    break;
                }
            }
        }

        return { errors, warnings };
    }

    /**
     * 生成验证报告
     */
    generateReport(data, fileInfo) {
        console.log('\n📊 数据验证报告');
        console.log('=' .repeat(50));
        
        console.log(`📁 文件信息:`);
        console.log(`   大小: ${(fileInfo.size / 1024).toFixed(2)} KB`);
        console.log(`   记录数: ${data.records ? data.records.length : 0}`);
        console.log(`   最后更新: ${data.metadata ? data.metadata.lastUpdated : 'N/A'}`);
        console.log(`   版本: ${data.metadata ? data.metadata.version : 'N/A'}`);

        // 结构验证
        const structureResult = this.validateStructure(data);
        console.log(`\n🏗️  结构验证:`);
        if (structureResult.errors.length === 0) {
            console.log('   ✅ 数据结构正确');
        } else {
            console.log(`   ❌ 发现 ${structureResult.errors.length} 个结构错误:`);
            structureResult.errors.forEach(error => {
                console.log(`      • ${error}`);
            });
        }

        if (structureResult.warnings.length > 0) {
            console.log(`   ⚠️  ${structureResult.warnings.length} 个警告:`);
            structureResult.warnings.forEach(warning => {
                console.log(`      • ${warning}`);
            });
        }

        // 一致性验证
        const consistencyResult = this.validateConsistency(data);
        console.log(`\n🔍 一致性验证:`);
        if (consistencyResult.errors.length === 0) {
            console.log('   ✅ 数据一致性正确');
        } else {
            console.log(`   ❌ 发现 ${consistencyResult.errors.length} 个一致性错误:`);
            consistencyResult.errors.forEach(error => {
                console.log(`      • ${error}`);
            });
        }

        if (consistencyResult.warnings.length > 0) {
            console.log(`   ⚠️  ${consistencyResult.warnings.length} 个警告:`);
            consistencyResult.warnings.forEach(warning => {
                console.log(`      • ${warning}`);
            });
        }

        // 总结
        const totalErrors = structureResult.errors.length + consistencyResult.errors.length;
        const totalWarnings = structureResult.warnings.length + consistencyResult.warnings.length;
        
        console.log('\n📋 验证总结:');
        if (totalErrors === 0) {
            console.log('   ✅ 数据验证通过！');
        } else {
            console.log(`   ❌ 发现 ${totalErrors} 个错误需要修复`);
        }
        
        if (totalWarnings > 0) {
            console.log(`   ⚠️  ${totalWarnings} 个警告建议处理`);
        }

        console.log('=' .repeat(50));
        
        return totalErrors === 0;
    }

    /**
     * 执行完整验证
     */
    async validate() {
        try {
            console.log('🔍 开始验证数据文件...');
            
            if (!this.config.token) {
                throw new Error('未设置 GITHUB_TOKEN 环境变量');
            }

            const fileInfo = await this.getFileContent();
            const isValid = this.generateReport(fileInfo.content, fileInfo);
            
            if (isValid) {
                console.log('\n🎉 数据验证成功完成！');
                process.exit(0);
            } else {
                console.log('\n❌ 数据验证失败，请修复错误后重试');
                process.exit(1);
            }
            
        } catch (error) {
            console.error('❌ 验证过程中发生错误:', error.message);
            process.exit(1);
        }
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    const validator = new DataValidator();
    validator.validate();
}

module.exports = DataValidator;