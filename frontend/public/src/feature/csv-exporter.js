import { Utils } from '../utils/utils.js';

export class CsvExporter {
    constructor(options = {}) {
        this.globalState = options.globalState;
        this.callbacks = options.callbacks || {};

        this.initializeElements();
        this.initializeEvents();
    }

    initializeElements() {
        this.downloadCsvButton = document.getElementById('downloadCsv');
    }

    initializeEvents() {
        this.downloadCsvButton.addEventListener('click', () => this.exportTranslationCsv());
    }

    // === ボタン状態管理 ===
    updateButtonState() {
        const shouldEnable = !!(this.globalState.pdfDoc && this.globalState.ocrData);
        if (this.downloadCsvButton) {
            this.downloadCsvButton.disabled = !shouldEnable;
        }
    }

    // === CSV エクスポート機能 ===

    async exportTranslationCsv() {
        try {
            // ファイル名を正しく取得（py8の場合はoriginalPdfFileから）
            const pdfFileName = this.globalState.originalPdfFile?.name || '';
            // CSVボタンを無効化して処理中であることを示す
            this.downloadCsvButton.disabled = true;
            this.downloadCsvButton.textContent = 'CSV生成中...';

            // 事前翻訳を実行（PDF生成と同様）
            await this.prepareAllTranslations();

            // CSV データを生成
            const csvData = await this.generateTranslationCsvData();

            // ファイル名を生成（js2と同じ形式）
            const filename = pdfFileName ? 
                pdfFileName.replace(/\.pdf$/i, '') + '_translation_results.csv' : 
                'translation_results.csv';

            // CSVファイルをダウンロード
            this.downloadCsvFile(csvData, filename);

        } catch (error) {
            console.error('CSVエクスポートエラー:', error);
            alert('CSVの生成中にエラーが発生しました。');
        } finally {
            // ボタンを元の状態に戻す
            this.downloadCsvButton.disabled = false;
            this.downloadCsvButton.textContent = '翻訳結果のダウンロード (CSV)';
        }
    }

    // === 事前翻訳機能（PDF生成と同様） ===

    // すべてのページの翻訳データを事前に準備
    async prepareAllTranslations() {
        // 全ページの翻訳を並列実行（PDF生成と同じパターン）
        const pagePromises = [];
        for (let pageNum = 1; pageNum <= this.globalState.totalPages; pageNum++) {
            pagePromises.push(this.preparePageTranslations(pageNum));
        }
        await Promise.all(pagePromises);
    }

    // 指定ページの翻訳データを準備
    async preparePageTranslations(pageNum) {
        const result = this.globalState.ocrData.results[0];
        const currentPageData = result.pages?.find(page => page.pageNum === pageNum);
        
        if (!currentPageData || !currentPageData.ocrResults) {
            return;
        }

        // 日本語テキストを収集
        const translationTasks = [];
        
        for (let i = 0; i < currentPageData.ocrResults.length; i++) {
            const ocrResult = currentPageData.ocrResults[i];
            const bboxId = this.callbacks.generateBboxId(pageNum, ocrResult);
            
            if (Utils.containsJapanese(ocrResult.text) && !this.callbacks.isBboxDeleted(bboxId)) {
                translationTasks.push({
                    text: ocrResult.text,
                    bboxId: bboxId
                });
            }
        }

        // 翻訳とRAG検索を並列実行
        for (const task of translationTasks) {
            const translationPromise = this.callbacks.translateText(task.text);
            const ragPromise = this.callbacks.performRAGSearch(task.text);
            
            try {
                const [translation, ragResult] = await Promise.all([translationPromise, ragPromise]);
                
                // 翻訳結果を直接globalStateに保存（py8の形式に合わせて）
                this.globalState.bboxTranslations.set(task.bboxId, translation);
                
                // RAGデータは別途保存（CSV用）
                if (!this.csvRAGData) {
                    this.csvRAGData = new Map();
                }
                this.csvRAGData.set(task.bboxId, ragResult);
                
            } catch (error) {
                console.warn(`翻訳/RAG検索失敗 for ${task.bboxId}:`, error);
            }
        }
    }

    async generateTranslationCsvData() {
        const csvData = [];

        // ヘッダー行を追加（js2と同じ）
        const headers = [
            'filename',
            'page',
            'text_no',
            'OCR結果テキスト',
            '翻訳対象テキスト',
            'AI翻訳結果',
            '出力テキスト',
            '類似サンプル日本語1',
            '類似サンプル英語1',
            '類似サンプルスコア1',
            '類似サンプル日本語2',
            '類似サンプル英語2',
            '類似サンプルスコア2',
            '類似サンプル日本語3',
            '類似サンプル英語3',
            '類似サンプルスコア3',
            '類似サンプル日本語4',
            '類似サンプル英語4',
            '類似サンプルスコア4',
            '類似サンプル日本語5',
            '類似サンプル英語5',
            '類似サンプルスコア5'
        ];
        csvData.push(headers);

        // ファイル名を取得（拡張子を除く）
        const pdfFileName = this.globalState.originalPdfFile?.name || '';

        // OCRデータから処理
        if (this.globalState.ocrData && this.globalState.ocrData.results) {
            for (const result of this.globalState.ocrData.results) {
                if (!result.pages) continue;
                
                for (const page of result.pages) {
                    if (!page.ocrResults) continue;
                    
                    // Y座標でソート用の配列を作成（js2と同様）
                    const pageBboxes = [];
                    
                    for (let i = 0; i < page.ocrResults.length; i++) {
                        const ocrResult = page.ocrResults[i];
                        const bboxId = this.callbacks.generateBboxId ? 
                            this.callbacks.generateBboxId(page.pageNum, ocrResult) : 
                            `${page.pageNum}_${i}`;
                        
                        // 削除されたbboxはスキップ
                        if (this.callbacks.isBboxDeleted && this.callbacks.isBboxDeleted(bboxId)) {
                            continue;
                        }
                        
                        // 翻訳データを取得（py8のglobalState構造に合わせて）
                        const translationResult = this.globalState.bboxTranslations?.get(bboxId);
                        const editedTranslation = this.globalState.bboxEditedTranslations?.get(bboxId);
                        const ragResult = this.csvRAGData?.get(bboxId);
                        
                        // 日本語テキストのみ処理、翻訳データがなくても含める
                        if (Utils.containsJapanese(ocrResult.text)) {
                            pageBboxes.push({
                                bboxId: bboxId,
                                y: ocrResult.boundingBox?.top || 0,
                                ocrText: ocrResult.text || '',
                                translateText: ocrResult.text || '',
                                llmTranslationText: translationResult || '',
                                outputText: editedTranslation || translationResult || '',
                                ragSearchResult: ragResult
                            });
                        }
                    }
                    
                    // Y座標でソート（上から下へ）
                    pageBboxes.sort((a, b) => a.y - b.y);
                    
                    // CSV行データを生成
                    for (let i = 0; i < pageBboxes.length; i++) {
                        const bbox = pageBboxes[i];
                        const textNo = i + 1; // 1から始まる通し番号
                        
                        // RAGサンプルデータを作成
                        const ragSamples = this.makeRagSamplesForCsv(bbox.ragSearchResult);
                        
                        const row = [
                            pdfFileName ? pdfFileName.replace(/\.pdf$/i, '') : '',
                            page.pageNum,
                            textNo,
                            bbox.ocrText,
                            bbox.translateText,
                            bbox.llmTranslationText,
                            bbox.outputText,
                            ...ragSamples
                        ];

                        csvData.push(row);
                    }
                }
            }
        }

        return csvData;
    }

    // RAGサンプルデータをCSV用に変換（py8のAPI構造に対応）
    makeRagSamplesForCsv(ragSearchResult) {
        const ragSamples = [];
        
        // py8のAPI構造: ragSearchResult.result が配列
        const results = ragSearchResult?.result || [];
        
        // 最大5件のサンプルデータを処理
        for (let i = 0; i < 5; i++) {
            if (results[i]) {
                const item = results[i];
                const body = item.body || {};
                // スコアの取得（py8バックエンドの形式に対応）
                const score = item._score || item.score || item.search_score || item.reranker_score || 0;

                // RAGレスポンスから\rを削除してCSV用にクリーンアップ
                const japaneseText = (body.text || '').replace(/\r/g, '');
                const englishText = (body.data_source || '').replace(/\r/g, '');

                ragSamples.push(
                    japaneseText,
                    englishText,
                    typeof score === 'number' ? score.toFixed(4) : score.toString()
                );
            } else {
                // データがない場合は空文字を3つ追加
                ragSamples.push('', '', '');
            }
        }

        return ragSamples;
    }

    downloadCsvFile(csvData, filename) {
        // CSV文字列に変換（js2と同じロジック）
        const csvString = csvData.map(row => {
            return row.map(cell => {
                // セル内容をエスケープ（ダブルクォートを含む場合の処理）
                const cellStr = String(cell || '');
                if (cellStr.includes('"') || cellStr.includes(',') || cellStr.includes('\n')) {
                    return '"' + cellStr.replace(/"/g, '""') + '"';
                }
                return cellStr;
            }).join(',');
        }).join('\n');

        // BOMを追加してUTF-8で保存（Excelで文字化けを防ぐ）
        const bom = '\uFEFF';
        const csvWithBom = bom + csvString;

        // Blobを作成してダウンロード
        const blob = new Blob([csvWithBom], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }
    }
}
