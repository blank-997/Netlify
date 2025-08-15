/**
 * 离线缓存管理脚本
 * 支持数据缓存、离线访问和缓存清理
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class OfflineCacheManager {
    constructor() {
        this.config = {
            cacheDir: './cache',
            maxCacheSize: 50 * 1024 * 1024, // 50MB
            maxCacheAge: 7 * 24 * 60 * 60 * 1000, // 7天
            compressionEnabled: true,
            encryptionEnabled: false,
            encryptionKey: process.env.CACHE_ENCRYPTION_KEY || 'default-key-change-me'
        };
        
        this.cacheIndex = new Map();
        this.cacheStats = {
            totalSize: 0,
            totalFiles: 0,
            hits: 0,
            misses: 0,
            lastCleanup: null
        };
        
        this.initializeCache();
    }
    
    /**
     * 初始化缓存系统
     */
    initializeCache() {
        // 确保缓存目录存在
        if (!fs.existsSync(this.config.cacheDir)) {
            fs.mkdirSync(this.config.cacheDir, { recursive: true });
        }
        
        // 加载缓存索引
        this.loadCacheIndex();
        
        // 计算缓存统计
        this.updateCacheStats();
        
        console.log(`💾 缓存系统初始化完成`);
        console.log(`📁 缓存目录: ${path.resolve(this.config.cacheDir)}`);
        console.log(`📊 缓存文件: ${this.cacheStats.totalFiles}`);
        console.log(`💽 缓存大小: ${this.formatBytes(this.cacheStats.totalSize)}`);
    }
    
    /**
     * 加载缓存索引
     */
    loadCacheIndex() {
        const indexFile = path.join(this.config.cacheDir, 'cache-index.json');
        
        try {
            if (fs.existsSync(indexFile)) {
                const indexData = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
                this.cacheIndex = new Map(Object.entries(indexData.index || {}));
                this.cacheStats = { ...this.cacheStats, ...indexData.stats };
            }
        } catch (error) {
            console.warn('加载缓存索引失败，将创建新索引:', error.message);
            this.cacheIndex = new Map();
        }
    }
    
    /**
     * 保存缓存索引
     */
    saveCacheIndex() {
        const indexFile = path.join(this.config.cacheDir, 'cache-index.json');
        
        try {
            const indexData = {
                version: '1.0',
                timestamp: new Date().toISOString(),
                index: Object.fromEntries(this.cacheIndex),
                stats: this.cacheStats
            };
            
            fs.writeFileSync(indexFile, JSON.stringify(indexData, null, 2));
        } catch (error) {
            console.error('保存缓存索引失败:', error.message);
        }
    }
    
    /**
     * 生成缓存键
     */
    generateCacheKey(data) {
        if (typeof data === 'string') {
            return crypto.createHash('md5').update(data).digest('hex');
        } else {
            return crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
        }
    }
    
    /**
     * 压缩数据
     */
    compressData(data) {
        if (!this.config.compressionEnabled) {
            return data;
        }
        
        try {
            const zlib = require('zlib');
            return zlib.gzipSync(data).toString('base64');
        } catch (error) {
            console.warn('数据压缩失败，使用原始数据:', error.message);
            return data;
        }
    }
    
    /**
     * 解压数据
     */
    decompressData(compressedData, isCompressed = false) {
        if (!isCompressed || !this.config.compressionEnabled) {
            return compressedData;
        }
        
        try {
            const zlib = require('zlib');
            const buffer = Buffer.from(compressedData, 'base64');
            return zlib.gunzipSync(buffer).toString();
        } catch (error) {
            console.warn('数据解压失败，返回原始数据:', error.message);
            return compressedData;
        }
    }
    
    /**
     * 加密数据
     */
    encryptData(data) {
        if (!this.config.encryptionEnabled) {
            return data;
        }
        
        try {
            const cipher = crypto.createCipher('aes192', this.config.encryptionKey);
            let encrypted = cipher.update(data, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            return encrypted;
        } catch (error) {
            console.warn('数据加密失败，使用原始数据:', error.message);
            return data;
        }
    }
    
    /**
     * 解密数据
     */
    decryptData(encryptedData, isEncrypted = false) {
        if (!isEncrypted || !this.config.encryptionEnabled) {
            return encryptedData;
        }
        
        try {
            const decipher = crypto.createDecipher('aes192', this.config.encryptionKey);
            let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        } catch (error) {
            console.warn('数据解密失败，返回原始数据:', error.message);
            return encryptedData;
        }
    }
    
    /**
     * 存储数据到缓存
     */
    set(key, data, options = {}) {
        try {
            const cacheKey = this.generateCacheKey(key);
            const timestamp = Date.now();
            const ttl = options.ttl || this.config.maxCacheAge;
            
            // 处理数据
            let processedData = typeof data === 'string' ? data : JSON.stringify(data);
            
            // 压缩
            const compressed = this.compressData(processedData);
            const isCompressed = compressed !== processedData;
            
            // 加密
            const encrypted = this.encryptData(compressed);
            const isEncrypted = encrypted !== compressed;
            
            // 缓存元数据
            const metadata = {
                key: key,
                cacheKey: cacheKey,
                timestamp: timestamp,
                ttl: ttl,
                expiresAt: timestamp + ttl,
                size: Buffer.byteLength(encrypted, 'utf8'),
                isCompressed: isCompressed,
                isEncrypted: isEncrypted,
                dataType: typeof data,
                version: '1.0'
            };
            
            // 保存到文件
            const cacheFile = path.join(this.config.cacheDir, `${cacheKey}.cache`);
            const cacheData = {
                metadata: metadata,
                data: encrypted
            };
            
            fs.writeFileSync(cacheFile, JSON.stringify(cacheData));
            
            // 更新索引
            this.cacheIndex.set(cacheKey, metadata);
            
            // 更新统计
            this.cacheStats.totalFiles = this.cacheIndex.size;
            this.updateCacheStats();
            
            // 保存索引
            this.saveCacheIndex();
            
            console.log(`💾 缓存已保存: ${key} (${this.formatBytes(metadata.size)})`);
            return true;
            
        } catch (error) {
            console.error('缓存保存失败:', error.message);
            return false;
        }
    }
    
    /**
     * 从缓存获取数据
     */
    get(key) {
        try {
            const cacheKey = this.generateCacheKey(key);
            const metadata = this.cacheIndex.get(cacheKey);
            
            if (!metadata) {
                this.cacheStats.misses++;
                return null;
            }
            
            // 检查是否过期
            if (Date.now() > metadata.expiresAt) {
                console.log(`⏰ 缓存已过期: ${key}`);
                this.delete(key);
                this.cacheStats.misses++;
                return null;
            }
            
            // 读取缓存文件
            const cacheFile = path.join(this.config.cacheDir, `${cacheKey}.cache`);
            
            if (!fs.existsSync(cacheFile)) {
                console.warn(`缓存文件不存在: ${key}`);
                this.cacheIndex.delete(cacheKey);
                this.cacheStats.misses++;
                return null;
            }
            
            const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
            
            // 解密
            const decrypted = this.decryptData(cacheData.data, metadata.isEncrypted);
            
            // 解压
            const decompressed = this.decompressData(decrypted, metadata.isCompressed);
            
            // 解析数据
            let result;
            if (metadata.dataType === 'string') {
                result = decompressed;
            } else {
                result = JSON.parse(decompressed);
            }
            
            this.cacheStats.hits++;
            console.log(`✅ 缓存命中: ${key}`);
            return result;
            
        } catch (error) {
            console.error('缓存读取失败:', error.message);
            this.cacheStats.misses++;
            return null;
        }
    }
    
    /**
     * 删除缓存
     */
    delete(key) {
        try {
            const cacheKey = this.generateCacheKey(key);
            const metadata = this.cacheIndex.get(cacheKey);
            
            if (metadata) {
                const cacheFile = path.join(this.config.cacheDir, `${cacheKey}.cache`);
                
                if (fs.existsSync(cacheFile)) {
                    fs.unlinkSync(cacheFile);
                }
                
                this.cacheIndex.delete(cacheKey);
                this.updateCacheStats();
                this.saveCacheIndex();
                
                console.log(`🗑️  缓存已删除: ${key}`);
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('缓存删除失败:', error.message);
            return false;
        }
    }
    
    /**
     * 检查缓存是否存在
     */
    has(key) {
        const cacheKey = this.generateCacheKey(key);
        const metadata = this.cacheIndex.get(cacheKey);
        
        if (!metadata) {
            return false;
        }
        
        // 检查是否过期
        if (Date.now() > metadata.expiresAt) {
            this.delete(key);
            return false;
        }
        
        return true;
    }
    
    /**
     * 清理过期缓存
     */
    cleanupExpired() {
        let cleanedCount = 0;
        let cleanedSize = 0;
        
        console.log('🧹 开始清理过期缓存...');
        
        for (const [cacheKey, metadata] of this.cacheIndex.entries()) {
            if (Date.now() > metadata.expiresAt) {
                const cacheFile = path.join(this.config.cacheDir, `${cacheKey}.cache`);
                
                try {
                    if (fs.existsSync(cacheFile)) {
                        fs.unlinkSync(cacheFile);
                        cleanedSize += metadata.size;
                    }
                    
                    this.cacheIndex.delete(cacheKey);
                    cleanedCount++;
                } catch (error) {
                    console.error(`清理缓存失败 (${metadata.key}):`, error.message);
                }
            }
        }
        
        if (cleanedCount > 0) {
            this.updateCacheStats();
            this.saveCacheIndex();
            this.cacheStats.lastCleanup = new Date();
            
            console.log(`✅ 清理完成: ${cleanedCount} 个文件, ${this.formatBytes(cleanedSize)}`);
        } else {
            console.log('✅ 无需清理，所有缓存都有效');
        }
        
        return { cleanedCount, cleanedSize };
    }
    
    /**
     * 清理超大缓存
     */
    cleanupOversized() {
        if (this.cacheStats.totalSize <= this.config.maxCacheSize) {
            return { cleanedCount: 0, cleanedSize: 0 };
        }
        
        console.log('🧹 缓存超出限制，开始清理最旧的缓存...');
        
        // 按时间排序，最旧的优先清理
        const sortedEntries = Array.from(this.cacheIndex.entries())
            .sort((a, b) => a[1].timestamp - b[1].timestamp);
        
        let cleanedCount = 0;
        let cleanedSize = 0;
        
        for (const [cacheKey, metadata] of sortedEntries) {
            if (this.cacheStats.totalSize - cleanedSize <= this.config.maxCacheSize) {
                break;
            }
            
            const cacheFile = path.join(this.config.cacheDir, `${cacheKey}.cache`);
            
            try {
                if (fs.existsSync(cacheFile)) {
                    fs.unlinkSync(cacheFile);
                    cleanedSize += metadata.size;
                }
                
                this.cacheIndex.delete(cacheKey);
                cleanedCount++;
            } catch (error) {
                console.error(`清理缓存失败 (${metadata.key}):`, error.message);
            }
        }
        
        if (cleanedCount > 0) {
            this.updateCacheStats();
            this.saveCacheIndex();
            
            console.log(`✅ 大小清理完成: ${cleanedCount} 个文件, ${this.formatBytes(cleanedSize)}`);
        }
        
        return { cleanedCount, cleanedSize };
    }
    
    /**
     * 完整缓存清理
     */
    cleanup() {
        console.log('🚀 开始完整缓存清理...');
        
        const expiredResult = this.cleanupExpired();
        const oversizedResult = this.cleanupOversized();
        
        const totalCleaned = expiredResult.cleanedCount + oversizedResult.cleanedCount;
        const totalSize = expiredResult.cleanedSize + oversizedResult.cleanedSize;
        
        console.log('\n📊 清理总结');
        console.log('=' .repeat(40));
        console.log(`🗑️  清理文件: ${totalCleaned}`);
        console.log(`💽 释放空间: ${this.formatBytes(totalSize)}`);
        console.log(`📁 剩余文件: ${this.cacheStats.totalFiles}`);
        console.log(`💾 剩余大小: ${this.formatBytes(this.cacheStats.totalSize)}`);
        
        return {
            totalCleaned,
            totalSize,
            remaining: this.cacheStats.totalFiles
        };
    }
    
    /**
     * 更新缓存统计
     */
    updateCacheStats() {
        let totalSize = 0;
        
        for (const metadata of this.cacheIndex.values()) {
            totalSize += metadata.size;
        }
        
        this.cacheStats.totalSize = totalSize;
        this.cacheStats.totalFiles = this.cacheIndex.size;
    }
    
    /**
     * 获取缓存统计
     */
    getStats() {
        const hitRate = this.cacheStats.hits + this.cacheStats.misses > 0 
            ? (this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses) * 100).toFixed(2)
            : 0;
        
        return {
            ...this.cacheStats,
            hitRate: `${hitRate}%`,
            maxSize: this.formatBytes(this.config.maxCacheSize),
            usage: `${(this.cacheStats.totalSize / this.config.maxCacheSize * 100).toFixed(2)}%`
        };
    }
    
    /**
     * 格式化字节数
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    /**
     * 清空所有缓存
     */
    clear() {
        console.log('🗑️  清空所有缓存...');
        
        let deletedCount = 0;
        
        for (const [cacheKey, metadata] of this.cacheIndex.entries()) {
            const cacheFile = path.join(this.config.cacheDir, `${cacheKey}.cache`);
            
            try {
                if (fs.existsSync(cacheFile)) {
                    fs.unlinkSync(cacheFile);
                    deletedCount++;
                }
            } catch (error) {
                console.error(`删除缓存文件失败 (${metadata.key}):`, error.message);
            }
        }
        
        this.cacheIndex.clear();
        this.cacheStats = {
            totalSize: 0,
            totalFiles: 0,
            hits: 0,
            misses: 0,
            lastCleanup: new Date()
        };
        
        this.saveCacheIndex();
        
        console.log(`✅ 已清空 ${deletedCount} 个缓存文件`);
        return deletedCount;
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    const cacheManager = new OfflineCacheManager();
    
    const args = process.argv.slice(2);
    
    if (args.includes('--cleanup')) {
        cacheManager.cleanup();
    } else if (args.includes('--stats')) {
        console.log('📊 缓存统计:', JSON.stringify(cacheManager.getStats(), null, 2));
    } else if (args.includes('--clear')) {
        cacheManager.clear();
    } else {
        console.log('离线缓存管理器');
        console.log('使用方法:');
        console.log('  --cleanup  清理过期和超大缓存');
        console.log('  --stats    显示缓存统计信息');
        console.log('  --clear    清空所有缓存');
    }
}

module.exports = OfflineCacheManager;