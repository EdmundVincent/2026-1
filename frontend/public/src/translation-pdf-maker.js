/**
 * 翻訳PDF作成メインクラス
 * =======================
 * 
 * アプリケーションのメインコントローラークラス。
 * 全ての機能モジュールを統合し、コンポーネント間の依存関係を管理する。
 * 
 * 主要責務：
 * - 各機能モジュールの初期化と依存関係解決
 * - グローバル状態管理
 * - PDF表示、OCR、翻訳、編集機能の統合
 * 
 * アーキテクチャ：
 * - レベル1: 基盤クラス（依存関係なし）
 * - レベル2: コアクラス（基盤クラスのみに依存）
 * - レベル3: 統合クラス（全ての依存関係を持つ）
 */

import { HandleFiles } from './feature/handle-files.js';
import { ZoomController } from './feature/zoom-controller.js';
import { RagTranslation } from './feature/rag-translation.js';
import { PDFGenerator } from './feature/pdf-generator.js';
import { StampManager } from "./feature/stamp-manager.js";
import { EditPanel } from "./feature/edit-panel.js";
import { TextTranslation } from './feature/translation.js';
import { TranslationPanelManager } from './feature/translation-panel-manager.js';
import { BboxManager } from './feature/bbox-manager.js';
import { PDFRender } from './feature/pdf-renderer.js';
import { PageManager } from './feature/page-manager.js';
import { PageIndicatorController } from './feature/page-indicator-controller.js';
import { BboxAddManager } from './feature/bbox-add-manager.js';
import { BboxDeleteManager } from './feature/bbox-delete-manager.js';
import { CsvExporter } from './feature/csv-exporter.js';
import { Llm } from './api/llm.js';
import { RagSearch } from './api/rag-search.js';

export class TranslationPDFMaker {

    constructor(globalState) {
        // グローバルステートの初期化
        this.globalState = globalState;
        
        // === レベル1: 基盤クラス（他に依存しない） ===
        this.initFoundationClasses();
        
        // === レベル2: コアクラス（基盤クラスのみに依存） ===
        this.initCoreClasses();
        
        // === レベル3: 機能クラス（コアクラスに依存） ===
        this.initFeatureClasses();
        
        // === レベル4: UIクラス（機能クラスに依存） ===
        this.initUIClasses();
        
        // === レベル5: 管理クラス（すべてに依存可能） ===
        this.initManagerClasses();
        
        // === 最終: コールバック設定 ===
        this.setupCallbacks();
    }

    // === レベル1: 基盤クラス ===
    initFoundationClasses() {
        // API系（外部依存のみ）
        this.ragSearch = new RagSearch({
            globalState: this.globalState
        });
        
        this.llm = new Llm({
            globalState: this.globalState
        });
        
        // ファイル処理（基盤機能）
        this.fileNameHandler = new HandleFiles({ 
            globalState: this.globalState,
            callbacks: {} // 後で設定
        });
    }

    // === レベル2: コアクラス ===
    initCoreClasses() {
        // 拡大縮小（基盤機能）
        this.zoomController = new ZoomController({
            globalState: this.globalState,
            callbacks: {} // 後で設定
        });
        
        // RAG翻訳（ragSearchに依存）
        this.ragTranslation = new RagTranslation({ 
            globalState: this.globalState,
            ragSearch: this.ragSearch
        });
        
        // 編集パネル（基盤UI）
        this.editPanel = new EditPanel({
            globalState: this.globalState,
            callbacks: {} // 後で設定
        });

        // CSVエクスポート機能
        this.csvExporter = new CsvExporter({
            globalState: this.globalState,
            callbacks: {} // 後で設定
        });
    }

    // === レベル3: 機能クラス ===
    initFeatureClasses() {
        // PDF生成
        this.pdfGenerator = new PDFGenerator({
            globalState: this.globalState,
            fileNameHandler: this.fileNameHandler,
            callbacks: {} // 後で設定
        });
        
        // スタンプ管理
        this.stampManager = new StampManager({
            globalState: this.globalState,
            callbacks: {} // 後で設定
        });
    }

    // === レベル4: UIクラス ===
    initUIClasses() {
        // ページ管理
        this.pageManager = new PageManager({ 
            globalState: this.globalState,
            stampManager: this.stampManager,
            callbacks: {} // 後で設定
        });
        
        // ページインジケーター
        this.pageIndicatorController = new PageIndicatorController({ 
            globalState: this.globalState,
            stampManager: this.stampManager,
            callbacks: {} // 後で設定
        });
    }

    // === レベル5: 管理クラス ===
    initManagerClasses() {
        // BBox管理（中核）
        this.bboxManager = new BboxManager({
            globalState: this.globalState,
            ragTranslation: this.ragTranslation,
            callbacks: {} // 後で設定
        });
    // ズームコントローラにbboxManager参照を付与（フォントサイズ更新のため）
    this.zoomController.bboxManager = this.bboxManager;
        
        // テキスト翻訳
        this.textTranslation = new TextTranslation({
            globalState: this.globalState,
            bboxManager: this.bboxManager,
            ragTranslation: this.ragTranslation,
            llm: this.llm,
            ragSearch: this.ragSearch,
            callbacks: {} // 後で設定
        });
        
        // 翻訳パネル
        this.translationPanelManager = new TranslationPanelManager({
            globalState: this.globalState,
            textTranslation: this.textTranslation,
            ragTranslation: this.ragTranslation,
            bboxManager: this.bboxManager,
            ragSearch: this.ragSearch,
            callbacks: {} // 後で設定
        });
        
        // PDFレンダー（多くのクラスに依存）
        this.pdfRender = new PDFRender({
            globalState: this.globalState,
            bboxManager: this.bboxManager,
            zoomController: this.zoomController,
            stampManager: this.stampManager,
            textTranslation: this.textTranslation,
            translationPanelManager: this.translationPanelManager,
            pageIndicatorController: this.pageIndicatorController,
            callbacks: {} // 後で設定
        });
        
        // BBox追加/削除管理（最後）
        this.bboxAddManager = new BboxAddManager({ 
            globalState: this.globalState,
            bboxManager: this.bboxManager,
            textTranslation: this.textTranslation,
            pageIndicatorController: this.pageIndicatorController,
            pdfRender: this.pdfRender,
            callbacks: {} // 後で設定
        });
        
        this.bboxDeleteManager = new BboxDeleteManager({ 
            globalState: this.globalState,
            bboxManager: this.bboxManager,
            pageIndicatorController: this.pageIndicatorController,
            callbacks: {} // 後で設定
        });
    }

    // === コールバック設定（最終段階） ===
    setupCallbacks() {
        this.setupFoundationCallbacks();
        this.setupCoreCallbacks();
        this.setupFeatureCallbacks();
        this.setupPageManagerCallbacks();
        this.setupManagerCallbacks();
    }
    
    setupFoundationCallbacks() {
        // ファイルハンドラー
        this.fileNameHandler.callbacks = {
            updateZoomControls: () => this.zoomController.updateZoomControls(),
            updatePageIndicatorCurrent: () => this.pageIndicatorController.updatePageIndicatorCurrent(),
            updatePageIndicator: () => this.pageIndicatorController.updatePageIndicator(),
            renderPage: () => this.pdfRender.renderPage(this.globalState.currentPage),
            setDefaultScale: () => this.zoomController.setDefaultScale(),
            clearOCRBoxes: () => this.pdfRender.clearOCRBoxes()
        };
    }
    
    setupCoreCallbacks() {
        // ズームコントローラー
        this.zoomController.callbacks = {
            renderPage: (pageNumber) => this.pdfRender.renderPage(pageNumber)
        };

        // editPanelのコールバック
        this.editPanel.callbacks = {
            clearStampPreview: () => this.stampManager.clearStampPreview(),
            cancelCurrentStamp: () => this.stampManager.cancelCurrentStamp()
        }

        // CSVエクスポート機能は独立して動作（コールバック不要）
    }

    setupFeatureCallbacks() {
        // PDF生成
        this.pdfGenerator.callbacks = {
            getBboxFontSize: (bboxId) => this.bboxManager.getBboxFontSize(bboxId),
            generateBboxId: (pageNum, ocrResult) => this.bboxManager.generateBboxId(pageNum, ocrResult),
            isBboxDeleted: (bboxId) => this.bboxManager.isBboxDeleted(bboxId),
            getBboxEditedTranslation: (bboxId) => this.bboxManager.getBboxEditedTranslation(bboxId),
            getBboxWrapSetting: (bboxId) => this.bboxManager.getBboxWrapSetting(bboxId),
            translateText: (text) => this.textTranslation.translateText(text),
            translateBatch: (texts) => this.textTranslation.translateBatch(texts)  // バッチ翻訳追加
        };

        // CSVエクスポート
        this.csvExporter.callbacks = {
            generateBboxId: (pageNum, ocrResult) => this.bboxManager.generateBboxId(pageNum, ocrResult),
            isBboxDeleted: (bboxId) => this.bboxManager.isBboxDeleted(bboxId),
            translateText: (text) => this.textTranslation.translateText(text),
            translateBatch: (texts) => this.textTranslation.translateBatch(texts),
            performRAGSearch: (text) => this.ragSearch.performRAGSearch(text)
        };
        
        // スタンプ管理
        this.stampManager.callbacks = {
            renderPage: (pageNumber) => this.pdfRender.renderPage(pageNumber)
        };
    }

    setupPageManagerCallbacks() {
        // ページ管理
        this.pageManager.callbacks = {
            updateControls: () => this.fileNameHandler.updateControls(),
            clearPanelSelection: () => this.translationPanelManager.clearPanelSelection(),
            renderPage: () => this.pdfRender.renderPage(this.globalState.currentPage),
            updatePageIndicator: () => this.pageIndicatorController.updatePageIndicatorCurrent()
        };
        
        // ページインジケーター
        this.pageIndicatorController.callbacks = {
            generateBboxId: (pageNum, ocrResult) => this.bboxManager.generateBboxId(pageNum, ocrResult),
            isBboxDeleted: (bboxId) => this.bboxManager.isBboxDeleted(bboxId),
            getCustomBboxCountForPage: (pageNum) => this.bboxManager.getCustomBboxCountForPage(pageNum),
            getPageBboxes: (pageNum) => this.bboxManager.getPageBboxes(pageNum),
            getBboxConfirmationStatus: (bboxId) => this.bboxManager.getBboxConfirmationStatus(bboxId),
            updateControls: () => this.fileNameHandler.updateControls(),
            clearPanelSelection: () => this.translationPanelManager.clearPanelSelection(),
            renderPage: () => this.pdfRender.renderPage(this.globalState.currentPage),
            navigateToPage: (targetPage) => this.pageManager.navigateToPage(targetPage),
            countOriginalJapaneseBboxes: (pageNum) => this.bboxManager.countOriginalJapaneseBboxes(pageNum)
        };
    }

    setupManagerCallbacks() {    
        // BBox管理
        this.bboxManager.callbacks = {
            updateSelectionStatus: () => this.bboxAddManager.updateSelectionStatus(),
            loadOCRBoxIntoPanel: (bboxId) => this.translationPanelManager.loadOCRBoxIntoPanel(bboxId),
            translateText: (text) => this.textTranslation.translateText(text),
            updateRightPreview: () => this.pdfRender.updateRightPreview(),
            adjustPageIndicatorCount: (pageNum, adjustment) => this.pageIndicatorController.adjustPageIndicatorCount(pageNum, adjustment),
            updateDeleteTranslationModeUI: () => this.bboxDeleteManager.updateDeleteTranslationModeUI(),
            initializePanelContent: () => this.translationPanelManager.initializePanelContent(),
            initializePanelContentKeepingSamples: () => this.translationPanelManager.initializePanelContentKeepingSamples(),
            updateProgressBar: (pageNum, percentage, confirmedCount, totalCount) => this.pageIndicatorController.updateProgressBar(pageNum, percentage, confirmedCount, totalCount),
            updatePageConfirmationProgress: (pageNum) => this.pageIndicatorController.updatePageConfirmationProgress(pageNum),
            updateAllPageConfirmationProgress: () => this.pageIndicatorController.updateAllPageConfirmationProgress()
        };
        
        // テキスト翻訳
        this.textTranslation.callbacks = {
            loadRAGSamples: (text, bboxId, forceRefresh) => this.translationPanelManager.loadRAGSamples(text, bboxId, forceRefresh),
            updateRightPreview: () => this.pdfRender.updateRightPreview()
        };
        
        // 翻訳パネル管理
        this.translationPanelManager.callbacks = {
            updateRightPreview: () => this.pdfRender.updateRightPreview(),
            isBboxDeleted: (bboxId) => this.bboxManager.isBboxDeleted(bboxId),
            refreshBboxRendering: (bboxId) => this.pdfRender.refreshBboxRendering(bboxId),
            updatePageConfirmationProgress: (pageNum) => this.pageIndicatorController.updatePageConfirmationProgress(pageNum),
            updateBboxConfirmationAppearance: (bboxId, isConfirmed) => this.pdfRender.updateBboxConfirmationAppearance(bboxId, isConfirmed)
        };
        
        // PDFレンダー
        this.pdfRender.callbacks = {
            updateRightPreview: () => this.pdfRender.updateRightPreview(),
            adjustPageIndicatorCount: (pageNum, adjustment) => this.pageIndicatorController.adjustPageIndicatorCount(pageNum, adjustment),
            recalculateCurrentPageIndicatorCount: () => this.pageIndicatorController.recalculateCurrentPageIndicatorCount(),
            cancelSelection: () => this.bboxAddManager.cancelSelection(),
            enableDeleteTranslationMode: () => this.bboxDeleteManager.enableDeleteTranslationMode(),
            updateDeleteTranslationModeUI: () => this.bboxDeleteManager.updateDeleteTranslationModeUI(),
            updatePageConfirmationProgress: (pageNum) => this.pageIndicatorController.updatePageConfirmationProgress(pageNum),
            resetToDefaultState: () => this.bboxAddManager.resetToDefaultState()
        };
        
        // BBox追加管理
        this.bboxAddManager.callbacks = {
            updateRightPreview: () => this.pdfRender.updateRightPreview(),
            clearPanelSelection: () => this.translationPanelManager.clearPanelSelection(),
            updatePageConfirmationProgress: (pageNum) => this.pageIndicatorController.updatePageConfirmationProgress(pageNum),
            cancelSelection: () => this.bboxAddManager.cancelSelection(),
            resetPageIndicatorToOriginal: (pageNum) => this.pageIndicatorController.resetPageIndicatorToOriginal(pageNum),
            initializePanelContent: () => this.translationPanelManager.initializePanelContent(),
            initializePanelContentKeepingSamples: () => this.translationPanelManager.initializePanelContentKeepingSamples(),
            renderCustomBbox: (customBboxId, customBboxData) => this.pdfRender.renderCustomBbox(customBboxId, customBboxData)
        };
        
        // BBox削除管理
        this.bboxDeleteManager.callbacks = {
            updateRightPreview: () => this.pdfRender.updateRightPreview(),
            updatePageConfirmationProgress: (pageNum) => this.pageIndicatorController.updatePageConfirmationProgress(pageNum),
            enableAreaSelection: () => this.pdfRender.enableAreaSelection(),
            disableAreaSelection: () => this.pdfRender.disableAreaSelection()
        };
    }
}
