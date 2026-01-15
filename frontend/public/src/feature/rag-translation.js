import { Utils } from '../utils/utils.js';

/**
 * RagTranslation - RAG（Retrieval-Augmented Generation）翻訳クラス
 * 
 * 文書データベースからの関連情報検索を活用した高品質翻訳を提供する。
 * 専門用語や文脈に応じた翻訳精度向上のため、類似文書から関連情報を
 * 自動取得してプロンプトに含める機能を実装している。
 * 
 * 主要機能:
 * - 関連文書検索（Vector Search）
 * - 翻訳コンテキスト生成
 * - RAG結果キャッシュ管理
 * - 検索結果フィルタリング
 * - 翻訳品質スコアリング
 * - エラーハンドリング
 * 
 * RAGフロー:
 * 1. 入力テキストの意味解析
 * 2. ベクターデータベース検索
 * 3. 関連度スコアによるフィルタリング
 * 4. コンテキスト情報の整理
 * 5. 翻訳プロンプトへの統合
 * 6. 結果キャッシュ・再利用
 */
export class RagTranslation {
    constructor(options = {}) {
        this.globalState = options.globalState;
        this.bboxRAGCache = new Map(); // bboxID -> { text: string, ragResults: object }
    }

    // === ヘルパーメソッド（共通処理） ===

    /**
     * 設定値を安全に取得
     */
    getRAGSearchSize() {
        return this.globalState.translationConfig?.RAG_SEARCH_SIZE || 5;
    }

    /**
     * RAGログ出力の統一
     */
    logRAGOperation(operation, bboxId, text = '') {
        // デバッグログは削除済み
    }

    /**
     * サンプルデータの安全な抽出
     */
    extractSampleData(item, index) {
        const body = item?.body || {};
        return {
            [`sample${index + 1}_ja`]: body.text || '',
            [`sample${index + 1}_en`]: body.data_source || ''
        };
    }

    // === 1. RAGサンプル抽出 ===
    extractSamples(searchResult) {
        const samples = {};
        const results = searchResult?.result || [];
        const maxSamples = Math.min(this.getRAGSearchSize(), results.length);
        
        for (let i = 0; i < maxSamples; i++) {
            Object.assign(samples, this.extractSampleData(results[i], i));
        }
        
        return samples;
    }

    // === 2. RAGキャッシュ管理 ===
    getBboxRAGCache(bboxId, currentText) {
        const cached = this.bboxRAGCache.get(bboxId);
        if (cached && cached.text === currentText) {
            return cached.ragResults;
        }
        return null;
    }
    
    setBboxRAGCache(bboxId, text, ragResults) {
        this.bboxRAGCache.set(bboxId, {
            text: text,
            ragResults: ragResults
        });
        this.logRAGOperation('キャッシュ保存', bboxId, text);
    }

    clearBboxRAGCache(bboxId) {
        this.bboxRAGCache.delete(bboxId);
        this.logRAGOperation('キャッシュクリア', bboxId);
    }
}
