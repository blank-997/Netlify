/**
 * GitHub API 测试脚本
 * 用于测试GitHub API连接和各项功能
 */

const fetch = require('node-fetch');

class APITester {
    constructor() {
        this.config = {
            owner: process.env.GITHUB_OWNER || 'blank-997',
            repo: process.env.GITHUB_REPO || 'Netlify',
            token: process.env.GITHUB_TOKEN,
            dataFile: 'ip-records.json'
        };
        
        this.apiUrl = `https://api.github.com/repos/${this.config.owner}/${this.config.repo}`;
        this.testResults = [];
    }

    /**
     * 记录测试结果
     */
    recordTest(testName, success, message, details = null) {
        const result = {
            test: testName,
            success,
            message,
            details,
            timestamp: new Date().toISOString()
        };
        
        this.testResults.push(result);
        
        const icon = success ? '✅' : '❌';
        console.log(`${icon} ${testName}: ${message}`);
        
        if (details && !success) {
            console.log(`   详细信息: ${JSON.stringify(details, null, 2)}`);
        }
    }

    /**
     * 测试GitHub API基本连接
     */
    async testBasicConnection() {
        try {
            const response = await fetch('https://api.github.com/user', {
                headers: {
                    'Authorization': `token ${this.config.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Netlify-API-Tester/1.0'
                }
            });

            if (response.ok) {
                const user = await response.json();
                this.recordTest(
                    'GitHub API基本连接',
                    true,
                    `成功连接，用户: ${user.login}`,
                    { login: user.login, id: user.id }
                );
                return true;
            } else {
                this.recordTest(
                    'GitHub API基本连接',
                    false,
                    `连接失败: ${response.status} ${response.statusText}`,
                    { status: response.status, statusText: response.statusText }
                );
                return false;
            }
        } catch (error) {
            this.recordTest(
                'GitHub API基本连接',
                false,
                `连接异常: ${error.message}`,
                { error: error.message }
            );
            return false;
        }
    }

    /**
     * 测试仓库访问权限
     */
    async testRepositoryAccess() {
        try {
            const response = await fetch(this.apiUrl, {
                headers: {
                    'Authorization': `token ${this.config.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Netlify-API-Tester/1.0'
                }
            });

            if (response.ok) {
                const repo = await response.json();
                this.recordTest(
                    '仓库访问权限',
                    true,
                    `成功访问仓库: ${repo.full_name}`,
                    { 
                        name: repo.name,
                        private: repo.private,
                        permissions: repo.permissions
                    }
                );
                return true;
            } else {
                this.recordTest(
                    '仓库访问权限',
                    false,
                    `无法访问仓库: ${response.status} ${response.statusText}`,
                    { status: response.status }
                );
                return false;
            }
        } catch (error) {
            this.recordTest(
                '仓库访问权限',
                false,
                `访问异常: ${error.message}`,
                { error: error.message }
            );
            return false;
        }
    }

    /**
     * 测试数据文件读取
     */
    async testFileRead() {
        try {
            const response = await fetch(`${this.apiUrl}/contents/${this.config.dataFile}`, {
                headers: {
                    'Authorization': `token ${this.config.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Netlify-API-Tester/1.0'
                }
            });

            if (response.ok) {
                const fileData = await response.json();
                const content = Buffer.from(fileData.content, 'base64').toString('utf8');
                const jsonData = JSON.parse(content);
                
                this.recordTest(
                    '数据文件读取',
                    true,
                    `成功读取文件，大小: ${(fileData.size / 1024).toFixed(2)} KB`,
                    {
                        size: fileData.size,
                        recordCount: jsonData.records ? jsonData.records.length : 0,
                        lastUpdated: jsonData.metadata ? jsonData.metadata.lastUpdated : null
                    }
                );
                return { success: true, data: jsonData, sha: fileData.sha };
            } else {
                this.recordTest(
                    '数据文件读取',
                    false,
                    `无法读取文件: ${response.status} ${response.statusText}`,
                    { status: response.status }
                );
                return { success: false };
            }
        } catch (error) {
            this.recordTest(
                '数据文件读取',
                false,
                `读取异常: ${error.message}`,
                { error: error.message }
            );
            return { success: false };
        }
    }

    /**
     * 测试数据文件写入（创建测试文件）
     */
    async testFileWrite() {
        try {
            const testFileName = 'test-api-write.json';
            const testData = {
                test: true,
                timestamp: new Date().toISOString(),
                message: 'API写入测试'
            };
            
            const encodedContent = Buffer.from(JSON.stringify(testData, null, 2)).toString('base64');

            // 创建测试文件
            const createResponse = await fetch(`${this.apiUrl}/contents/${testFileName}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${this.config.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json',
                    'User-Agent': 'Netlify-API-Tester/1.0'
                },
                body: JSON.stringify({
                    message: 'API写入测试',
                    content: encodedContent
                })
            });

            if (createResponse.ok) {
                const createResult = await createResponse.json();
                
                // 立即删除测试文件
                const deleteResponse = await fetch(`${this.apiUrl}/contents/${testFileName}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `token ${this.config.token}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json',
                        'User-Agent': 'Netlify-API-Tester/1.0'
                    },
                    body: JSON.stringify({
                        message: '删除API测试文件',
                        sha: createResult.content.sha
                    })
                });

                if (deleteResponse.ok) {
                    this.recordTest(
                        '数据文件写入',
                        true,
                        '成功创建和删除测试文件',
                        { testFile: testFileName }
                    );
                    return true;
                } else {
                    this.recordTest(
                        '数据文件写入',
                        false,
                        '创建成功但删除失败，请手动删除测试文件',
                        { testFile: testFileName, deleteStatus: deleteResponse.status }
                    );
                    return false;
                }
            } else {
                this.recordTest(
                    '数据文件写入',
                    false,
                    `无法创建测试文件: ${createResponse.status} ${createResponse.statusText}`,
                    { status: createResponse.status }
                );
                return false;
            }
        } catch (error) {
            this.recordTest(
                '数据文件写入',
                false,
                `写入异常: ${error.message}`,
                { error: error.message }
            );
            return false;
        }
    }

    /**
     * 测试API速率限制
     */
    async testRateLimit() {
        try {
            const response = await fetch('https://api.github.com/rate_limit', {
                headers: {
                    'Authorization': `token ${this.config.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Netlify-API-Tester/1.0'
                }
            });

            if (response.ok) {
                const rateLimit = await response.json();
                const core = rateLimit.resources.core;
                const remaining = core.remaining;
                const total = core.limit;
                const resetTime = new Date(core.reset * 1000);
                
                const isHealthy = remaining > (total * 0.1); // 剩余超过10%认为健康
                
                this.recordTest(
                    'API速率限制检查',
                    isHealthy,
                    `剩余: ${remaining}/${total} (重置时间: ${resetTime.toLocaleString()})`,
                    {
                        remaining,
                        limit: total,
                        resetTime: resetTime.toISOString(),
                        healthy: isHealthy
                    }
                );
                return isHealthy;
            } else {
                this.recordTest(
                    'API速率限制检查',
                    false,
                    `无法获取速率限制信息: ${response.status}`,
                    { status: response.status }
                );
                return false;
            }
        } catch (error) {
            this.recordTest(
                'API速率限制检查',
                false,
                `检查异常: ${error.message}`,
                { error: error.message }
            );
            return false;
        }
    }

    /**
     * 测试分支访问
     */
    async testBranchAccess() {
        try {
            const response = await fetch(`${this.apiUrl}/branches`, {
                headers: {
                    'Authorization': `token ${this.config.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Netlify-API-Tester/1.0'
                }
            });

            if (response.ok) {
                const branches = await response.json();
                const branchNames = branches.map(branch => branch.name);
                const hasMain = branchNames.includes('main') || branchNames.includes('master');
                
                this.recordTest(
                    '分支访问',
                    hasMain,
                    `找到 ${branches.length} 个分支: ${branchNames.join(', ')}`,
                    { branches: branchNames, count: branches.length }
                );
                return hasMain;
            } else {
                this.recordTest(
                    '分支访问',
                    false,
                    `无法获取分支信息: ${response.status} ${response.statusText}`,
                    { status: response.status }
                );
                return false;
            }
        } catch (error) {
            this.recordTest(
                '分支访问',
                false,
                `访问异常: ${error.message}`,
                { error: error.message }
            );
            return false;
        }
    }

    /**
     * 生成测试报告
     */
    generateReport() {
        console.log('\n📊 API测试报告');
        console.log('=' .repeat(60));
        
        const successCount = this.testResults.filter(result => result.success).length;
        const totalCount = this.testResults.length;
        const successRate = ((successCount / totalCount) * 100).toFixed(1);
        
        console.log(`📈 测试概览:`);
        console.log(`   总测试数: ${totalCount}`);
        console.log(`   成功: ${successCount}`);
        console.log(`   失败: ${totalCount - successCount}`);
        console.log(`   成功率: ${successRate}%`);
        
        console.log('\n📋 详细结果:');
        this.testResults.forEach((result, index) => {
            const icon = result.success ? '✅' : '❌';
            console.log(`   ${index + 1}. ${icon} ${result.test}`);
            console.log(`      ${result.message}`);
            if (result.details && !result.success) {
                console.log(`      详细: ${JSON.stringify(result.details)}`);
            }
        });
        
        console.log('\n🔧 建议:');
        if (successRate < 100) {
            console.log('   ⚠️  存在失败的测试，请检查:');
            console.log('   • GitHub Token是否有效且具有足够权限');
            console.log('   • 仓库名称和所有者是否正确');
            console.log('   • 网络连接是否正常');
            console.log('   • API速率限制是否充足');
        } else {
            console.log('   🎉 所有测试通过！API配置正确。');
        }
        
        console.log('=' .repeat(60));
        
        return successRate === 100;
    }

    /**
     * 执行所有测试
     */
    async runAllTests() {
        console.log('🧪 开始API功能测试...');
        console.log(`🔧 配置信息: ${this.config.owner}/${this.config.repo}`);
        console.log('');
        
        if (!this.config.token) {
            console.error('❌ 未设置 GITHUB_TOKEN 环境变量');
            process.exit(1);
        }

        // 执行各项测试
        await this.testBasicConnection();
        await this.testRepositoryAccess();
        await this.testFileRead();
        await this.testFileWrite();
        await this.testRateLimit();
        await this.testBranchAccess();
        
        // 生成报告
        const allPassed = this.generateReport();
        
        if (allPassed) {
            console.log('\n🎉 所有API测试通过！');
            process.exit(0);
        } else {
            console.log('\n❌ 部分测试失败，请检查配置');
            process.exit(1);
        }
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    const tester = new APITester();
    tester.runAllTests();
}

module.exports = APITester;