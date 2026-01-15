import { Utils } from '../utils/utils.js';
import { BaseManager } from '../utils/base-manager.js';

/**
 * BboxAddManager - バウンディングボックス追加管理クラス
 * 
 * 新規翻訳範囲の追加機能を管理する。
 * ユーザーが範囲選択した領域に対して翻訳を追加したり、
 * 複数のbboxを結合してカスタムbboxを作成する機能を提供する。
 * 
 * 主要機能:
 * - 追加モードの管理（開始・終了・切り替え）
 * - 範囲選択状態の管理
 * - 選択範囲の翻訳追加処理
 * - 複数bboxの結合処理
 * - デフォルト状態への復元
 */
export class BboxAddManager {
	constructor(options = {}) {
		this.globalState = options.globalState;
		this.bboxManager = options.bboxManager; // BboxManagerのインスタンスを受け取る
		this.textTranslation = options.textTranslation; // テキスト翻訳のインスタンスを受け取る
		this.pageIndicatorController = options.pageIndicatorController; // ページインジケータのコントローラーを受け取る
		this.pdfRender = options.pdfRender; // PDFレンダーのインスタンスを受け取る
		// this.pdfRender = options.pdfRender;
		this.callbacks = options.callbacks || {};

		this.initializeElements();
		this.initializeEvents();
	}

	// ===== 1. 初期化・要素取得・イベント登録 =====

	initializeElements() {
		// Bbox追加ボタン
		this.toggleAddTranslationButton = document.getElementById('toggleAddTranslationButton');
		this.resetToDefaultButton = document.getElementById('resetToDefaultButton');
		this.addTranslationButton = document.getElementById('addTranslationButton');
		this.joinTranslationButton = document.getElementById('joinTranslationButton');
		this.cancelSelectionButton = document.getElementById('cancelSelectionButton');
		this.selectionStatus = document.getElementById('selectionStatus');
        
		// Canvas要素
		this.canvasLeft = document.getElementById('pdfCanvasLeft');
		this.canvasContainerLeft = this.canvasLeft.closest('.canvas-container');
	}

	initializeEvents() {
		this.resetToDefaultButton.addEventListener('click', () => this.resetToDefaultState());
		this.toggleAddTranslationButton.addEventListener('click', () => this.toggleAddTranslationMode());
		this.addTranslationButton.addEventListener('click', () => this.addTranslationFromSelection());
		this.joinTranslationButton.addEventListener('click', () => this.joinTranslation());
		this.cancelSelectionButton.addEventListener('click', () => this.clearSelection());
	}

	// ===== 2. 追加モード管理 =====

	toggleAddTranslationMode() {
		if (this.globalState.isAddTranslationMode) {
			// 現在追加モードが有効な場合は無効にする
			this.cancelSelection();
		} else {
			// 現在追加モードが無効な場合は有効にする
			this.startAddTranslationMode();
		}
	}

	startAddTranslationMode() {
		this.globalState.isAddTranslationMode = true;
		this.globalState.selectedBboxIds.clear();
        
		// UI状態の一括設定
		this.setAddModeUI(true);
		this.setAddModeButtons(true);
        
		this.selectionStatus.textContent = '0個選択';
	}

	cancelSelection() {
		this.globalState.isAddTranslationMode = false;
		this.globalState.selectedBboxIds.clear();
        
		// UI状態の一括設定
		this.setAddModeUI(false);
		this.setAddModeButtons(false);
        
		this.selectionStatus.textContent = '';
        
		// 全ての選択状態をクリア
		this.bboxManager.clearAllSelectedBbox();
	}

	// ===== 3. 選択状態管理 =====

	// 追加モードを継続したまま選択状態のみをクリア
	clearSelection() {
		// 選択されたbboxをクリア
		this.globalState.selectedBboxIds.clear();
        
		// 視覚的な選択状態をクリア
		this.bboxManager.clearAllSelectedBbox();
        
		// 選択状態に応じてボタンの状態を更新
		this.updateSelectionStatus();
	}

	updateSelectionStatus() {
		const count = this.globalState.selectedBboxIds.size;
		this.selectionStatus.textContent = `${count}個選択`;
        
		// 追加ボタンと確認ボタンの状態を更新
		this.addTranslationButton.disabled = count === 0;
		this.joinTranslationButton.disabled = count === 0;
        
		// 選択解除ボタンの状態を更新
		if (this.globalState.isAddTranslationMode) {
			// 追加モード時: 選択があるときのみ有効
			this.cancelSelectionButton.disabled = count === 0;
		} else {
			// 通常モード、バッチ選択モード、スタンプモード時: 常に無効
			this.cancelSelectionButton.disabled = true;
		}
	}

	// ===== 4. 翻訳・bbox操作 =====

	/**
	 * 選択された範囲から翻訳を追加する
	 * 
	 * 主要処理フロー:
	 * 1. 前提条件の検証
	 * 2. 選択されたbboxデータの取得
	 * 3. 各bboxの個別翻訳処理
	 * 4. ページごとの追加数カウント
	 * 5. UI状態の更新
	 */
	async addTranslationFromSelection() {
		// 基本的な前提条件をチェック
		if (!this.validateAddTranslationState()) {
			return;
		}
        
		// 選択されたbboxの情報を取得
		const selectedBboxes = this.getSelectedBboxesWithData();
		if (!selectedBboxes) {
			return; // エラーメッセージは getSelectedBboxesWithData 内で表示済み
		}
        
		// 追加ボタンを処理中状態に変更
		const buttonState = BaseManager.setButtonProcessing(this.addTranslationButton, '翻訳中...');
        
		try {
			// ページごとのカスタムbbox追加数をカウント
			const pageAddCounts = new Map();
            
			// 各選択されたbboxを個別に処理
			for (const { id: bboxId, data: bboxData } of selectedBboxes) {
				if (!bboxId) continue;
                
				// 日本語テキストを翻訳
				const japaneseText = bboxData.text;
				if (!japaneseText.trim()) continue;
                
				// 翻訳を実行
				const translatedText = await this.textTranslation.translateText(japaneseText);
                
				// 新しいカスタムbboxIDを生成
				this.globalState.customBboxCounter++;
				const customBboxId = `custom_${bboxData.pageNum}_${this.globalState.customBboxCounter}`;
                
				// 新しいbboxデータを作成（英訳版）
				const customBboxData = {
					pageNum: bboxData.pageNum,
					text: translatedText,
					bbox: bboxData.bbox,
					ocrResult: {
						text: translatedText,
						bbox: bboxData.bbox
					},
					isCustom: true,
					sourceBboxIds: [bboxId]
				};
                
				// bboxデータを保存
				this.bboxManager.setBboxData(customBboxId, customBboxData);
                
				// 翻訳結果を保存
				this.globalState.bboxTranslations.set(customBboxId, translatedText);
				this.bboxManager.setBboxEditedTranslation(customBboxId, translatedText);
                
				// ページごとの追加数をカウント
				const pageNum = bboxData.pageNum;
				pageAddCounts.set(pageNum, (pageAddCounts.get(pageNum) || 0) + 1);
			}
            
			// ページごとにインジケータを更新
			for (const [pageNum, addCount] of pageAddCounts) {
				this.pageIndicatorController.adjustPageIndicatorCount(pageNum, addCount);
			}
            
			// 右側プレビューを更新
			this.callbacks.updateRightPreview();
            
			// 進捗率バーも更新
			setTimeout(() => {
				for (const [pageNum] of pageAddCounts) {
					this.callbacks.updatePageConfirmationProgress(pageNum);
				}
			}, 100);
            
			// 選択モードを終了
			this.cancelSelection();
            
			this.showSuccess(`${selectedBboxes.length}個の範囲の翻訳が完了しました`);
            
		} catch (error) {
			console.error('翻訳追加エラー:', error);
			this.showError('翻訳処理中にエラーが発生しました', error);
		} finally {
			// ボタンの状態を復元
			BaseManager.restoreButtonState(this.addTranslationButton, buttonState);
		}
	}

	joinTranslation() {
		// 基本的な前提条件をチェック
		if (!this.validateSelectionForJoin()) {
			return;
		}
        
		try {
			// BboxManagerでカスタムbboxデータを作成
			const result = this.bboxManager.createCustomBboxData(this.globalState.selectedBboxIds);
            
			// PDFRenderで描画
			this.callbacks.renderCustomBbox(result.customBboxId, result.customBboxData);
            
			// プレビューを更新
			this.callbacks.updateRightPreview();
            
			// ページインジケーターを更新
			this.callbacks.updatePageConfirmationProgress(result.customBboxData.pageNum);
            
			// 選択モードを終了
			this.clearSelection();
            
		} catch (error) {
			console.error('bbox結合エラー:', error);
			this.showError('bbox結合中にエラーが発生しました', error);
		}
	}

	// デフォルト状態に戻す機能
	resetToDefaultState() {
		// 追加モードの状態チェックと処理
		if (!this.handleAddModeForReset()) {
			return;
		}

		// 確認ダイアログを表示
		if (!this.confirmResetToDefault()) {
			return;
		}

		// 現在のページを取得
		const currentPage = this.globalState.currentPage;

		// 現在のページの全てのカスタムbboxと削除済みbboxを削除
		const removedBboxIds = this.removeCustomAndDeletedBboxes(currentPage);

		// UI更新
		this.updateUIAfterReset(currentPage, removedBboxIds);

		this.showSuccess(`右側プレビューをデフォルト状態に戻しました。\n削除されたbbox数: ${removedBboxIds.length}`);
	}

	// === ヘルパーメソッド（共通処理） ===

	/**
	 * 追加翻訳の前提条件をチェック
	 */
	validateAddTranslationState() {
		if (!this.globalState.isAddTranslationMode) {
			this.showError('追加モードが有効になっていません');
			return false;
		}
        
		if (this.globalState.selectedBboxIds.size === 0) {
			this.showError('翻訳する範囲を選択してください');
			return false;
		}
        
		return true;
	}

	/**
	 * 結合操作の前提条件をチェック
	 */
	validateSelectionForJoin() {
		if (this.globalState.selectedBboxIds.size === 0) {
			this.showError('bboxを選択してください');
			return false;
		}
        
		return true;
	}

	/**
	 * 選択されたbboxのデータを取得
	 */
	getSelectedBboxesWithData() {
		const selectedBboxes = Array.from(this.globalState.selectedBboxIds)
			.map(id => ({ id, data: this.bboxManager.getBboxData(id) }))
			.filter(item => item.data);
        
		if (selectedBboxes.length === 0) {
			this.showError('有効な選択範囲がありません');
			return null;
		}
        
		return selectedBboxes;
	}

	/**
	 * リセット時の追加モード処理
	 */
	handleAddModeForReset() {
		if (!this.globalState.isAddTranslationMode) {
			return true; // 処理継続
		} else {
			// 現在追加モードが有効な場合は無効にする
			this.callbacks.cancelSelection();
			return true; // 処理継続
		}
	}

	/**
	 * リセット確認ダイアログ
	 */
	confirmResetToDefault() {
		return confirm('右側プレビューをデフォルト状態（日本語検知bboxのみ）に戻しますか？');
	}

	/**
	 * カスタム・削除済みbboxの削除処理
	 */
	removeCustomAndDeletedBboxes(currentPage) {
		const allBboxIds = Array.from(this.globalState.bboxData.keys());
		const removedBboxIds = [];

		for (const bboxId of allBboxIds) {
			const bboxData = this.bboxManager.getBboxData(bboxId);
			if (bboxData && bboxData.pageNum === currentPage) {
				// カスタムbboxまたは削除済みbboxを削除
				if (bboxData.isCustom || this.bboxManager.isBboxDeleted(bboxId)) {
					this.globalState.bboxData.delete(bboxId);
					this.globalState.deletedBboxes.delete(bboxId);
					removedBboxIds.push(bboxId);
				}
			}
		}

		return removedBboxIds;
	}

	/**
	 * リセット後のUI更新
	 */
	updateUIAfterReset(currentPage, removedBboxIds) {
		// ページインジケーターを元に戻す
		this.callbacks.resetPageIndicatorToOriginal(currentPage);

		// 右側プレビューを更新
		this.callbacks.updateRightPreview();

		// 翻訳パネルがカスタムbboxまたは削除済みbboxを表示していた場合は内容を初期化
		if (this.globalState.selectedOCRBox && removedBboxIds.includes(this.globalState.selectedOCRBox.bboxId)) {
			this.globalState.selectedOCRBox = null;
			// パネルは隠さずに内容だけを初期化（RAGサンプルは保持）
			this.callbacks.initializePanelContentKeepingSamples();
		}
	}

	/**
	 * エラーメッセージ表示の統一
	 */
	showError(message, error = null) {
		if (error) {
			console.error(message, error);
			alert(`${message}: ${error.message || error}`);
		} else {
			console.error(message);
			alert(message);
		}
	}

	/**
	 * 成功メッセージ表示の統一
	 */
	showSuccess(message) {
		alert(message);
	}

	/**
	 * 追加モードのUI状態を設定
	 */
	setAddModeUI(isActive) {
		BaseManager.setModeUI({
			button: this.toggleAddTranslationButton,
			container: this.canvasContainerLeft,
			containerClass: 'selection-mode-active',
			isActive: isActive,
			texts: {
				active: '追加中',
				inactive: '追加モード'
			}
		});
	}

	/**
	 * 追加モード関連ボタンの状態を一括設定
	 */
	setAddModeButtons(isActive) {
		if (isActive) {
			BaseManager.setButtonsDisabled(this, {
				toggleAddTranslationButton: false,
				resetToDefaultButton: false,
				addTranslationButton: true,
				joinTranslationButton: true,
				cancelSelectionButton: true
			});
		} else {
			BaseManager.setButtonsDisabled(this, {
				toggleAddTranslationButton: false,
				resetToDefaultButton: true,
				addTranslationButton: true,
				joinTranslationButton: true,
				cancelSelectionButton: true
			});
		}
	}
}

