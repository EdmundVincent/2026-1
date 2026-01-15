import { Utils } from '../utils/utils.js';

/**
 * TranslationPanelManager - 翻訳パネル管理クラス
 * 
 * 右側の翻訳編集パネルの動作を管理する。
 * OCRテキストの編集、翻訳処理、出力調整、RAGサンプル表示など、
 * 翻訳ワークフローの中核機能を提供する。
 * 
 * 主要機能:
 * - OCR結果テキストの編集
 * - 翻訳対象テキストの正規化
 * - 翻訳実行・再翻訳
 * - 出力テキストの編集・書式設定
 * - RAGサンプルの表示・活用
 * - 確認ステータスの管理
 */
export class TranslationPanelManager {
    constructor(options = {}) {
        this.globalState = options.globalState; 
        this.bboxManager = options.bboxManager;
        this.textTranslation = options.textTranslation;
        this.ragTranslation = options.ragTranslation;
        this.ragSearch = options.ragSearch || null; // RAG検索インスタンス
        this.callbacks = options.callbacks || {};

        this.ragSearchResults = null; // 現在のRAG検索結果

        this.initializeElements();
        this.initEvents();
    }

    initializeElements() {
        // 右側プレビュー・キャンバス
        this.overlayRight = document.getElementById('overlayRight');
        this.canvasRight = document.getElementById('pdfCanvasRight');

        // 翻訳編集パネル
        this.translationPanel = document.getElementById('translationPanel');
        this.togglePanelButton = document.getElementById('togglePanel');

        // 確認ステータス
        this.confirmationStatusText = document.getElementById('confirmationStatusText');
        this.toggleConfirmationButton = document.getElementById('toggleConfirmationButton');

        // OCR結果テキスト
        this.ocrTextArea = document.getElementById('ocrText');

        // 対象テキスト
        this.targetTextArea = document.getElementById('targetText');
        this.normalizeButton = document.getElementById('normalizeButton');
        this.editNormalizePromptButton = document.getElementById('editNormalizePromptButton');
        this.retranslateButton = document.getElementById('retranslateButton');
        this.editPromptButton = document.getElementById('editPromptButton');

        // 出力テキスト
        this.outputTextArea = document.getElementById('outputText');
        this.textWrapToggle = document.getElementById('textWrapToggle');
        this.fontSizeInput = document.getElementById('fontSizeInput');
        this.fontSizeDecrease = document.getElementById('fontSizeDecrease');
        this.fontSizeIncrease = document.getElementById('fontSizeIncrease');
        this.widthDecrease = document.getElementById('widthDecrease');
        this.widthIncrease = document.getElementById('widthIncrease');
        this.widthInput = document.getElementById('widthInput');

        // AI翻訳結果
        this.aiTranslationResultArea = document.getElementById('aiTranslationResult');
        this.applyAiTranslationButton = document.getElementById('applyAiTranslationButton');

        // RAGサンプル
        this.ragSamplesList = document.getElementById('ragSamplesList');

        // プロンプト編集モーダル
        this.promptEditModal = document.getElementById('promptEditModal');
        this.closePromptModal = document.getElementById('closePromptModal');
        this.promptTextArea = document.getElementById('promptTextArea');
        this.resetPromptButton = document.getElementById('resetPromptButton');
        this.savePromptButton = document.getElementById('savePromptButton');
        this.cancelPromptButton = document.getElementById('cancelPromptButton');

        // 正規化プロンプト編集モーダル
        this.normalizePromptEditModal = document.getElementById('normalizePromptEditModal');
        this.closeNormalizePromptModal = document.getElementById('closeNormalizePromptModal');
        this.normalizePromptTextArea = document.getElementById('normalizePromptTextArea');
        this.resetNormalizePromptButton = document.getElementById('resetNormalizePromptButton');
        this.saveNormalizePromptButton = document.getElementById('saveNormalizePromptButton');
        this.cancelNormalizePromptButton = document.getElementById('cancelNormalizePromptButton');
    }

    initEvents() {
        // 右側プレビュー・キャンバス（イベントなし）

        // 翻訳編集パネル
        this.togglePanelButton.addEventListener('click', () => this.toggleTranslationPanel());

        // 確認ステータス
        this.toggleConfirmationButton.addEventListener('click', () => this.toggleConfirmationStatus());

        // OCR結果テキスト
        this.ocrTextArea.addEventListener('input', (e) => this.onOcrTextEdited(e));

        // 対象テキスト
        this.normalizeButton.addEventListener('click', () => this.onNormalizeButtonClicked());
        this.editNormalizePromptButton.addEventListener('click', () => this.textTranslation.openNormalizePromptEditModal());
        this.retranslateButton.addEventListener('click', () => this.onRetranslateButtonClicked());
        this.editPromptButton.addEventListener('click', () => this.textTranslation.openPromptEditModal());

        // 出力テキスト
        this.outputTextArea.addEventListener('input', (e) => this.onOutputTextEdited(e));
        this.textWrapToggle.addEventListener('change', (e) => this.onTextWrapToggled(e));
        this.fontSizeInput.addEventListener('input', (e) => this.onFontSizeChanged(e));
        this.fontSizeInput.addEventListener('change', (e) => this.onFontSizeChanged(e));
        this.fontSizeDecrease.addEventListener('click', () => this.decreaseFontSize());
        this.fontSizeIncrease.addEventListener('click', () => this.increaseFontSize());
        this.widthDecrease.addEventListener('click', () => this.decreaseWidth());
        this.widthIncrease.addEventListener('click', () => this.increaseWidth());
        if (this.widthInput) {
            this.widthInput.addEventListener('change', (e) => this.onWidthInputChanged(e));
            this.widthInput.addEventListener('keydown', (e) => this.onWidthInputKeyDown(e));
            this.widthInput.addEventListener('click', (e) => { e.stopPropagation(); });
            this.widthInput.addEventListener('focus', (e) => { e.target.select(); });
        } else {
            console.error('Width input element not found');
        }

        // AI翻訳結果
        this.applyAiTranslationButton.addEventListener('click', () => this.onApplyAiTranslationButtonClicked());

        // RAGサンプル（イベントなし）

        // プロンプト編集モーダル
        this.closePromptModal.addEventListener('click', () => this.textTranslation.closePromptEditModal());
        this.cancelPromptButton.addEventListener('click', () => this.textTranslation.closePromptEditModal());
        this.savePromptButton.addEventListener('click', () => this.textTranslation.saveCustomPrompt());
        this.resetPromptButton.addEventListener('click', () => this.textTranslation.resetPromptToDefault());
        this.promptEditModal.addEventListener('click', (e) => {
            if (e.target === this.promptEditModal) {
                this.textTranslation.closePromptEditModal();
            }
        });

        // 正規化プロンプト編集モーダル
        this.closeNormalizePromptModal.addEventListener('click', () => this.textTranslation.closeNormalizePromptEditModal());
        this.cancelNormalizePromptButton.addEventListener('click', () => this.textTranslation.closeNormalizePromptEditModal());
        this.saveNormalizePromptButton.addEventListener('click', () => this.textTranslation.saveCustomNormalizePrompt());
        this.resetNormalizePromptButton.addEventListener('click', () => this.textTranslation.resetNormalizePromptToDefault());
        this.normalizePromptEditModal.addEventListener('click', (e) => {
            if (e.target === this.normalizePromptEditModal) {
                this.textTranslation.closeNormalizePromptEditModal();
            }
        });
    }

    // === 共通ユーティリティメソッド ===
    
    /**
     * 選択されたOCRボックスの存在確認
     */
    _validateSelectedOCRBox(alertMessage = 'OCRボックスが選択されていません') {
        if (!this.globalState.selectedOCRBox) {
            alert(alertMessage);
            return false;
        }
        return true;
    }

    /**
     * ボタンの状態を一時的に変更（処理中表示）
     */
    _setButtonProcessing(button, processingText = '⏳', originalText = null) {
        const originalState = {
            disabled: button.disabled,
            textContent: originalText || button.textContent
        };
        button.disabled = true;
        button.textContent = processingText;
        return originalState;
    }

    /**
     * ボタンの状態を復元
     */
    _restoreButtonState(button, originalState) {
        if (button && originalState) {
            button.disabled = originalState.disabled;
            button.textContent = originalState.textContent;
        }
    }

    /**
     * フォントサイズの範囲チェックと正規化
     */
    _validateAndNormalizeFontSize(fontSize) {
        if (isNaN(fontSize) || fontSize < 1) return 1;
        if (fontSize > 24) return 24;
        return fontSize;
    }

    /**
     * BBoxデータの更新とプレビュー反映
     */
    _updateBboxAndRefreshPreview(bboxId, updateCallback) {
        if (updateCallback) {
            updateCallback();
        }
        this.callbacks.updateRightPreview();
    }

    /**
     * 幅調整の共通処理
     */
    _adjustWidth(bboxId, adjustment) {
        const currentWidth = this.globalState.bboxWidths.get(bboxId) || 1.0;
        const newWidth = Math.max(0.5, Math.min(3.0, currentWidth + adjustment));
        
        this.globalState.bboxWidths.set(bboxId, newWidth);
        this.updateWidthDisplay(newWidth);
        this.callbacks.refreshBboxRendering(bboxId);
    }

    /**
     * フォントサイズ調整の共通処理
     */
    _adjustFontSize(adjustment) {
        if (!this._validateSelectedOCRBox()) return;
        
        let currentSize = parseInt(this.fontSizeInput.value);
        if (isNaN(currentSize)) currentSize = 12;
        
        const newSize = this._validateAndNormalizeFontSize(currentSize + adjustment);
        this.fontSizeInput.value = newSize;
        
        // フォントサイズ変更イベントを手動で発火
        this.onFontSizeChanged({ target: this.fontSizeInput });
    }

    /**
     * BBox設定の保存と更新の共通処理
     */
    _saveBboxSettingAndUpdate(bboxId, updateCallback) {
        if (updateCallback) {
            updateCallback();
        }
        this.callbacks.updateRightPreview();
    }

    // === パネル全体操作 ===
    async loadOCRBoxIntoPanel(bboxId) {
        const bboxData = this.bboxManager.getBboxData(bboxId);
        if (!bboxData) return;
        
        // 現在選択されているOCRボックスを更新
        this.globalState.selectedOCRBox = { bboxId, bboxData };
        
        // 選択されたOCRボックスの視覚的フィードバック
        this.bboxManager.updateSelectedOCRBoxVisual();
        
        // パネルを表示
        this.showTranslationPanel();
        
        // OCR結果テキストを表示（編集可能）
        this.ocrTextArea.value = bboxData.text;
        
        // 対象テキストを表示（編集可能）
        this.targetTextArea.value = bboxData.text;
        
        // 編集済み翻訳があるかチェック（出力テキスト用）
        let outputText = this.bboxManager.getBboxEditedTranslation(bboxId);
        
        // AI翻訳結果をロード
        let aiTranslationResult = this.globalState.bboxTranslations.get(bboxId);
        
        if (!aiTranslationResult) {
            // AI翻訳結果がない場合は翻訳を実行（日本語の有無に関係なく）
            this.aiTranslationResultArea.value = '翻訳中...';
            this.applyAiTranslationButton.disabled = true;
            try {
                aiTranslationResult = await this.textTranslation.translateText(bboxData.text);
                this.globalState.bboxTranslations.set(bboxId, aiTranslationResult);
                this.aiTranslationResultArea.value = aiTranslationResult;
                this.applyAiTranslationButton.disabled = false;
                
                // 出力テキストが未設定の場合はAI翻訳結果をデフォルトに設定
                if (!outputText) {
                    outputText = aiTranslationResult;
                    this.bboxManager.setBboxEditedTranslation(bboxId, outputText);
                }
            } catch (error) {
                console.error('翻訳エラー:', error);
                this.aiTranslationResultArea.value = '翻訳に失敗しました';
                this.applyAiTranslationButton.disabled = true;
                if (!outputText) {
                    outputText = bboxData.text; // フォールバック
                }
            }
        } else {
            this.aiTranslationResultArea.value = aiTranslationResult;
            this.applyAiTranslationButton.disabled = false;
            
            // 出力テキストが未設定の場合はAI翻訳結果をデフォルトに設定
            if (!outputText) {
                outputText = aiTranslationResult;
                this.bboxManager.setBboxEditedTranslation(bboxId, outputText);
            }
        }
        
        // 出力テキストを設定
        this.outputTextArea.value = outputText;
        
        // 折り返し設定を復元
        const isWrapEnabled = this.bboxManager.getBboxWrapSetting(bboxId);
        this.textWrapToggle.checked = isWrapEnabled;
        this.updateOutputTextWrapStyle(isWrapEnabled);
        
        // フォントサイズ設定を復元
        const fontSize = this.bboxManager.getBboxFontSize(bboxId);
        this.fontSizeInput.value = fontSize;
        
        // 幅設定を復元（右側の翻訳ボックスの幅調整）
        const currentWidth = this.globalState.bboxWidths.get(bboxId) || 1.0;
        this.updateWidthDisplay(currentWidth);
        
        // 確認ステータスを表示
        const isConfirmed = this.bboxManager.getBboxConfirmationStatus(bboxId);
        this.updateConfirmationStatusUI(isConfirmed);
        
        // RAGサンプルをロード（bboxIdを渡してキャッシュ機能を有効化）
        await this.loadRAGSamples(bboxData.text, bboxId);
    }

    showTranslationPanel() {
        this.translationPanel.style.display = 'flex';
        const panelContent = this.translationPanel.querySelector('.panel-content');
        panelContent.style.display = 'flex';
        this.togglePanelButton.textContent = '−';
    }

    clearPanelSelection() {
        // Clear current selection
        this.globalState.selectedOCRBox = null;
        this.bboxManager.updateSelectedOCRBoxVisual();
        
        // Clear panel content
        this.ocrTextArea.value = '';
        this.targetTextArea.value = '';
        this.outputTextArea.value = '';
        this.aiTranslationResultArea.value = '';
        this.ragSamplesList.innerHTML = '<div class="no-samples-message">OCRボックスを選択してください</div>';
    }

    initializePanelContent() {
        // 全てのフィールドを空にする
        this.ocrTextArea.value = '';
        this.targetTextArea.value = '';
        this.outputTextArea.value = '';
        this.aiTranslationResultArea.value = '';
        
        this.retranslateButton.disabled = true;
        this.applyAiTranslationButton.disabled = true;
        
        // 幅調整コントロールも無効化（選択されたbboxがないため）
        if (this.widthDecrease) this.widthDecrease.disabled = true;
        if (this.widthIncrease) this.widthIncrease.disabled = true;
        if (this.widthInput) this.widthInput.value = '100';
        
        // フォントサイズコントロールをデフォルトにリセット
        this.fontSizeInput.value = 12;
        
        // RAGサンプルをクリア
        this.ragSamplesList.innerHTML = '<div class="no-samples-message">テキストボックスを選択してください</div>';
        
        // 確認ステータスを初期状態にリセット
        this.updateConfirmationStatusUI(false);
        
        // 選択されたOCRボックスの視覚的フィードバックをクリア
        // this.clearSelectedOCRBoxVisual();
    }

    // RAGサンプルを保持するバージョンのパネル初期化（デフォルトボタン用）
    initializePanelContentKeepingSamples() {
        // 全てのフィールドを空にする
        this.ocrTextArea.value = '';
        this.targetTextArea.value = '';
        this.outputTextArea.value = '';
        this.aiTranslationResultArea.value = '';
        
        this.retranslateButton.disabled = true;
        this.applyAiTranslationButton.disabled = true;
        
        // 幅調整コントロールも無効化（選択されたbboxがないため）
        if (this.widthDecrease) this.widthDecrease.disabled = true;
        if (this.widthIncrease) this.widthIncrease.disabled = true;
        if (this.widthInput) this.widthInput.value = '100';
        
        // フォントサイズコントロールをデフォルトにリセット
        this.fontSizeInput.value = 12;
        
        // RAGサンプルはクリアしない（保持する）
        
        // 確認ステータスを初期状態にリセット
        this.updateConfirmationStatusUI(false);
        
        // 選択されたOCRボックスの視覚的フィードバックをクリア
        // this.clearSelectedOCRBoxVisual();
    }

    // === togglePanelBtn ===
    toggleTranslationPanel() {
        const panelContent = this.translationPanel.querySelector('.panel-content');
        const isCollapsed = panelContent.style.display === 'none';
        
        if (isCollapsed) {
            panelContent.style.display = 'flex';
            this.togglePanelButton.textContent = '−';
        } else {
            panelContent.style.display = 'none';
            this.togglePanelButton.textContent = '+';
        }
    }

    // === toggleConfirmationButton ===
    toggleConfirmationStatus() {
        if (!this.globalState.selectedOCRBox) {
            return;
        }

        const bboxId = this.globalState.selectedOCRBox.bboxId;
        const currentStatus = this.bboxManager.getBboxConfirmationStatus(bboxId);
        const newStatus = !currentStatus;
        
        // ステータスを更新
        this.bboxManager.setBboxConfirmationStatus(bboxId, newStatus);
        
        // UIを更新
        this.updateConfirmationStatusUI(newStatus);
    }

    updateConfirmationStatusUI(isConfirmed) {
        if (!this.confirmationStatusText || !this.toggleConfirmationButton) {
            return;
        }

        if (isConfirmed) {
            // 確認済み状態
            this.confirmationStatusText.textContent = '確認済';
            this.confirmationStatusText.className = 'status-text confirmed';
            this.toggleConfirmationButton.textContent = '未確認に戻す';
            this.toggleConfirmationButton.className = 'toggle-confirmation-button confirmed';
        } else {
            // 未確認状態
            this.confirmationStatusText.textContent = '未確認';
            this.confirmationStatusText.className = 'status-text unconfirmed';
            this.toggleConfirmationButton.textContent = '確認完了';
            this.toggleConfirmationButton.className = 'toggle-confirmation-button';
        }
        
        // 現在のページの進捗率を更新
        if (this.globalState.selectedOCRBox) {
            const bboxData = this.bboxManager.getBboxData(this.globalState.selectedOCRBox.bboxId);
            if (bboxData) {
                this.callbacks.updatePageConfirmationProgress(bboxData.pageNum);
                // bboxの見た目を更新
                this.callbacks.updateBboxConfirmationAppearance(this.globalState.selectedOCRBox.bboxId, isConfirmed);
            }
        }
    }

    // === normalizeButton ===
    async onNormalizeButtonClicked() {
        if (!this.globalState.selectedOCRBox) {
            alert('OCRボックスが選択されていません');
            return;
        }

        const currentText = this.targetTextArea.value.trim();
        if (!currentText) {
            alert('対象テキストが入力されていません');
            return;
        }

        const bboxId = this.globalState.selectedOCRBox.bboxId;
        
        // 正規化ボタンを無効化
        this.normalizeButton.disabled = true;
        this.normalizeButton.textContent = '⏳';
        
        try {
            // テキスト正規化を実行
            const normalizedText = await this.textTranslation.normalizeText(currentText);
            
            // 対象テキストを正規化結果で更新
            this.targetTextArea.value = normalizedText;
            
            // bboxの対象テキストを更新
            const bboxData = this.bboxManager.getBboxData(bboxId);
            if (bboxData) {
                bboxData.text = normalizedText;
                this.bboxManager.setBboxData(bboxId, bboxData);
            }
            
            // 元テキストも更新（今後の変更検知のため）
            this.globalState.bboxOriginalTexts.set(bboxId, normalizedText);
            
        } catch (error) {
            console.error('正規化エラー:', error);
            alert('テキストの正規化に失敗しました');
        } finally {
            // 正規化ボタンを有効化
            this.normalizeButton.disabled = false;
            this.normalizeButton.textContent = '📖';
        }
    }

    // === retranslateButton ===
    onRetranslateButtonClicked() {
        if (!this.globalState.selectedOCRBox) return;
        
        const currentTargetText = this.targetTextArea.value.trim();
        
        if (!currentTargetText) {
            alert('対象テキストが入力されていません');
            return;
        }
        
        // 再翻訳を実行
        this.textTranslation.retranslateFromTargetText(currentTargetText);
    }

    // === ocrTextArea ===
    onOcrTextEdited(event) {
        if (!this._validateSelectedOCRBox()) return;
        
        const editedText = event.target.value;
        const bboxId = this.globalState.selectedOCRBox.bboxId;
        
        // OCRテキストの変更を反映
        this._updateBboxOcrText(bboxId, editedText);
    }

    // === outputTextArea ===
    onOutputTextEdited(event) {
        if (!this._validateSelectedOCRBox()) return;
        
        const editedText = event.target.value;
        const bboxId = this.globalState.selectedOCRBox.bboxId;
        
        // BBoxデータを更新
        this._updateBboxAndRefreshPreview(bboxId, () => {
            this.bboxManager.setBboxEditedTranslation(bboxId, editedText);
        });
    }

    // === textWrapToggle ===
    onTextWrapToggled(event) {
        if (!this._validateSelectedOCRBox()) return;
        
        const bboxId = this.globalState.selectedOCRBox.bboxId;
        const isWrapEnabled = event.target.checked;
        
        // BBoxデータを更新
        this._updateBboxAndRefreshPreview(bboxId, () => {
            this.bboxManager.setBboxWrapSetting(bboxId, isWrapEnabled);
            this.updateOutputTextWrapStyle(isWrapEnabled);
        });
    }
    
    updateOutputTextWrapStyle(isWrapEnabled) {
        // CSSクラスを切り替え
        this.outputTextArea.classList.remove('no-wrap', 'wrap-enabled');
        
        if (isWrapEnabled) {
            this.outputTextArea.classList.add('wrap-enabled');
        } else {
            this.outputTextArea.classList.add('no-wrap');
        }
    }

    // === fontSizeInput ===
    onFontSizeChanged(event) {
        if (!this.globalState.selectedOCRBox) return;
        
        let fontSize = parseInt(event.target.value);
        
        // 範囲チェック
        fontSize = this._validateAndNormalizeFontSize(fontSize);
        
        // 入力値を正規化
        event.target.value = fontSize;
        
        const bboxId = this.globalState.selectedOCRBox.bboxId;
        
        // bbox個別のフォントサイズ設定を保存
        this.bboxManager.setBboxFontSize(bboxId, fontSize);
        
        // 右側プレビューを更新（フォントサイズを反映）
        this.callbacks.updateRightPreview();
    }
    
    // === fontSizeDecrease ===
    decreaseFontSize() {
        this._adjustFontSize(-1);
    }
    
    // === fontSizeIncrease ===
    increaseFontSize() {
        this._adjustFontSize(1);
    }

    // === widthDecrease ===
    decreaseWidth() {
        if (!this._validateSelectedOCRBox()) return;
        
        const bboxId = this.globalState.selectedOCRBox.bboxId;
        this._adjustWidth(bboxId, -0.1);
    }

    // === widthIncrease ===
    increaseWidth() {
        if (!this._validateSelectedOCRBox()) return;
        
        const bboxId = this.globalState.selectedOCRBox.bboxId;
        this._adjustWidth(bboxId, 0.1);
    }

    // === widthInput ===
    onWidthInputChanged(event) {
        if (!this.globalState.selectedOCRBox) {
            return;
        }
        
        // テキスト入力から数値を抽出（%記号を除去）
        const inputText = event.target.value.replace('%', '').trim();
        
        // 空の場合は何もしない（bboxの状態を保持）
        if (inputText === '') {
            event.target.classList.remove('pending', 'error');
            return;
        }
        
        const inputValue = parseInt(inputText);
        
        // 入力値の検証
        if (isNaN(inputValue) || inputValue < 50 || inputValue > 300) {
            event.target.classList.add('error');
            setTimeout(() => {
                event.target.classList.remove('error');
                // 無効な値の場合、現在の値に戻す
                const bboxId = this.globalState.selectedOCRBox.bboxId;
                const currentWidth = this.globalState.bboxWidths.get(bboxId) || 1.0;
                event.target.value = Math.round(currentWidth * 100);
            }, 1000);
            return;
        }
        
        // changeイベントでは即座に適用（フォーカスを外した時など）
        this.applyWidthChange(inputValue);
        event.target.classList.remove('pending', 'error');
    }

    onWidthInputKeyDown(event) {
        // Enter キーで変更を確定
        if (event.key === 'Enter') {
            const inputText = event.target.value.replace('%', '').trim();
            
            // 空でない場合のみ適用
            if (inputText !== '') {
                const inputValue = parseInt(inputText);
                if (!isNaN(inputValue) && inputValue >= 50 && inputValue <= 300) {
                    this.applyWidthChange(inputValue);
                    event.target.classList.remove('pending', 'error');
                } else {
                    event.target.classList.add('error');
                    setTimeout(() => {
                        event.target.classList.remove('error');
                        // 無効な値の場合、現在の値に戻す
                        const bboxId = this.globalState.selectedOCRBox.bboxId;
                        const currentWidth = this.globalState.bboxWidths.get(bboxId) || 1.0;
                        event.target.value = Math.round(currentWidth * 100);
                    }, 1000);
                }
            } else {
                event.target.classList.remove('pending', 'error');
            }
            
            event.target.blur(); // フォーカスを外す
            return;
        }
        
        // 入力中の状態を示す
        if (['Backspace', 'Delete', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(event.key)) {
            event.target.classList.add('pending');
            event.target.classList.remove('error');
        }
        
        // 数字、バックスペース、削除、矢印キー、タブキー、%記号を許可
        const allowedKeys = [
            'Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter',
            '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '%'
        ];
        
        if (!allowedKeys.includes(event.key) && !event.ctrlKey && !event.metaKey) {
            event.preventDefault();
        }
    }

    // 幅変更を適用する関数
    applyWidthChange(inputValue) {
        if (!this.globalState.selectedOCRBox) return;
        
        const bboxId = this.globalState.selectedOCRBox.bboxId;
        const newWidth = inputValue / 100; // パーセンテージから比率に変換
        this.globalState.bboxWidths.set(bboxId, newWidth);
        this.callbacks.refreshBboxRendering(bboxId);
    }
    
    // 幅表示を更新
    updateWidthDisplay(width) {
        if (this.widthInput) {
            this.widthInput.value = Math.round(width * 100);
            this.widthInput.classList.remove('pending', 'error');
        }
    }

    // === applyAiTranslationButton ===
    onApplyAiTranslationButtonClicked() {
        if (!this._validateSelectedOCRBox('OCRボックスが選択されていません')) return;
        
        const aiTranslationText = this.aiTranslationResultArea.value.trim();
        
        if (!aiTranslationText || aiTranslationText === '翻訳中...' || aiTranslationText === '翻訳に失敗しました') {
            alert('AI翻訳結果が利用できません');
            return;
        }
        
        const bboxId = this.globalState.selectedOCRBox.bboxId;
        
        // AI翻訳結果を出力テキストに反映
        this.outputTextArea.value = aiTranslationText;
        
        // BBoxデータを更新
        this._updateBboxAndRefreshPreview(bboxId, () => {
            this.bboxManager.setBboxEditedTranslation(bboxId, aiTranslationText);
        });
    }

    // === RAGサンプル ===
    async loadRAGSamples(text, bboxId = null, forceRefresh = false) {
        // bboxIdが指定されていて、強制リフレッシュでない場合はキャッシュをチェック
        if (bboxId && !forceRefresh) {
            const cachedResult = this.ragTranslation.getBboxRAGCache(bboxId, text);
            if (cachedResult) {
                this.ragSearchResults = cachedResult;
                this.displayRAGSamples(cachedResult.result);
                return;
            }
        }
        
        // RAG検索を実行
        this.ragSamplesList.innerHTML = '<div class="no-samples-message">検索中...</div>';
        
        try {
            const searchResult = await this.ragSearch.performRAGSearch(text);
            if (searchResult && searchResult.result) {
                this.ragSearchResults = searchResult;
                
                // キャッシュに保存
                if (bboxId) {
                    this.ragTranslation.setBboxRAGCache(bboxId, text, searchResult);
                }
                
                this.displayRAGSamples(searchResult.result);
            } else {
                this.ragSamplesList.innerHTML = '<div class="no-samples-message">サンプルが見つかりませんでした</div>';
            }
        } catch (error) {
            console.error('RAG検索エラー:', error);
            this.ragSamplesList.innerHTML = '<div class="no-samples-message">検索に失敗しました</div>';
        }
    }

    displayRAGSamples(results) {
        this.ragSamplesList.innerHTML = '';
        
        if (!results || results.length === 0) {
            this.ragSamplesList.innerHTML = '<div class="no-samples-message">サンプルデータはありません</div>';
            return;
        }
        
        results.slice(0, 5).forEach((result, index) => {
            const sampleItem = this.createRAGSampleItem(result, index);
            this.ragSamplesList.appendChild(sampleItem);
        });
    }

    createRAGSampleItem(result, index) {
        const item = document.createElement('div');
        item.className = 'rag-sample-item';
        
        const score = result._score ? result._score.toFixed(3) : 'N/A';
        const japaneseText = result.body?.text || '';
        const englishText = result.body?.data_source || '';
        
        item.innerHTML = `
            <div class="rag-sample-content">
                <div class="rag-sample-texts">
                    <div class="rag-sample-japanese">${this.escapeHtml(japaneseText)}</div>
                    <div class="rag-sample-english">${this.escapeHtml(englishText)}</div>
                </div>
                <button class="rag-sample-apply-button" data-index="${index}">反映</button>
            </div>
        `;
        
        // 反映ボタンのイベントリスナー
        const applyBtn = item.querySelector('.rag-sample-apply-button');
        applyBtn.addEventListener('click', () => this.applyRAGSample(result));
        
        return item;
    }

    async applyRAGSample(ragSample) {
        if (!this._validateSelectedOCRBox('OCRボックスが選択されていません')) return;
        
        const bboxId = this.globalState.selectedOCRBox.bboxId;
        const englishText = ragSample.body?.data_source || '';
        
        if (!englishText.trim()) {
            alert('選択されたサンプルに英語テキストがありません');
            return;
        }
        
        // 類似サンプルの英語テキストをそのまま出力テキストに設定
        this.outputTextArea.value = englishText;
        
        // BBoxデータを更新
        this._updateBboxAndRefreshPreview(bboxId, () => {
            this.bboxManager.setBboxEditedTranslation(bboxId, englishText);
        });
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // === OCRテキスト更新メソッド ===
    _updateBboxOcrText(bboxId, newOcrText) {
        // OCRデータを更新
        const bboxData = this.bboxManager.getBboxData(bboxId);
        if (bboxData) {
            bboxData.text = newOcrText;
            this.bboxManager.setBboxData(bboxId, bboxData);
        }
        
        // 翻訳対象テキストも自動的に更新（OCRテキストがベース）
        this.targetTextArea.value = newOcrText;
        
        // グローバルステートの更新
        this.globalState.bboxOriginalTexts.set(bboxId, newOcrText);
    }

}
